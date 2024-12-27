import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import { Category } from "../../../models/category_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { body, param } from "express-validator";
import { PACK_REQUIREMENTS } from "../../../config/app_requirement";
import { Types } from "mongoose";
import { processObject } from "../../../utils/process_object";
import { packKeysToRemove } from "../../../interfaces/pack_interface";
import { transformPack } from "../../../utils/responces_templates/response_views_transformer";

export const updatePackValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("name")
    .optional()
    .trim()
    .isLength({ max: PACK_REQUIREMENTS.nameMaxLength })
    .withMessage(
      `Pack name cannot exceed ${PACK_REQUIREMENTS.nameMaxLength} characters`
    ),
  body("description")
    .optional()
    .trim()
    .isLength({ max: PACK_REQUIREMENTS.descriptionMaxLength })
    .withMessage(
      `Description cannot exceed ${PACK_REQUIREMENTS.descriptionMaxLength} characters`
    ),
  body("isAnimatedPack")
    .optional()
    .isBoolean()
    .withMessage("Invalid animation type"),
  body("isPrivate")
    .optional()
    .isBoolean()
    .withMessage("Invalid private pack status"),
  body("categoryIds")
    .optional()
    .isArray()
    .withMessage("Category IDs must be an array"),
  body("categoryNames")
    .optional()
    .isArray()
    .withMessage("Category names must be an array"),
  body("removeCategoryIds")
    .optional()
    .isArray()
    .withMessage("Remove category IDs must be an array"),
  body("removeCategoryIds.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid category ID format for removal"),
];

export const updatePack = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { packId } = req.params;
  const {
    name,
    description,
    isAnimatedPack,
    isPrivate,
    categoryIds = [],
    categoryNames = [],
    removeCategoryIds = [],
  } = req.body;

  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      updatePackValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: Array.isArray(validationErrors)
          ? validationErrors.join(", ")
          : validationErrors,
        status: 400,
      });
    }

    // Find pack with proper population
    const pack = await StickerPack.findById(packId)
      .populate("categories")
      .populate({
        path: "creator",
        select: "name avatar",
        populate: {
          path: "avatar",
          model: "Image",
          select: "url",
        },
      });

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist.",
        status: 404,
      });
    }

    // Check ownership
    if (pack.creator._id.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You do not have permission to update this pack.",
        status: 403,
      });
    }

    // Validate pack state
    if (isPrivate !== undefined && isPrivate && pack.stickers.length === 0) {
      return sendErrorResponse({
        res,
        message: "Cannot publish empty pack",
        errorCode: "EMPTY_PACK",
        errorDetails: "Pack must contain at least one sticker to be published.",
        status: 400,
      });
    }

    if (
      pack.stickers.length > 0 &&
      isAnimatedPack !== undefined &&
      isAnimatedPack !== pack.isAnimatedPack
    ) {
      return sendErrorResponse({
        res,
        message: "Cannot change pack type",
        errorCode: "PACK_TYPE_LOCKED",
        errorDetails: "You cannot change the pack type if it has stickers.",
        status: 400,
      });
    }

    // Handle category updates
    if (
      removeCategoryIds.length > 0 ||
      categoryIds.length > 0 ||
      categoryNames.length > 0
    ) {
      // Validate removeCategoryIds belong to the pack
      if (removeCategoryIds.length > 0) {
        const invalidRemoveIds = removeCategoryIds.filter(
          (id) => !pack.categories.some((cat) => cat._id.toString() === id)
        );

        if (invalidRemoveIds.length > 0) {
          return sendErrorResponse({
            res,
            message: "Invalid categories for removal",
            errorCode: "INVALID_REMOVE_CATEGORIES",
            errorDetails:
              "Some categories for removal are not assigned to this pack",
            status: 400,
          });
        }
      }

      // Get current categories minus the ones to be removed
      const currentCategoryIds = pack.categories
        .map((cat) => cat._id.toString())
        .filter((id) => !removeCategoryIds.includes(id));

      // First, try to find existing categories by name
      const existingCategories =
        categoryNames.length > 0
          ? await Category.find({
              name: {
                $in: categoryNames.map((name) => new RegExp(`^${name}$`, "i")),
              },
              isActive: true,
            })
          : [];

      // Get names that didn't match existing categories
      const newCategoryNames = categoryNames.filter(
        (name) =>
          !existingCategories.some(
            (cat) => cat.name.toLowerCase() === name.toLowerCase()
          )
      );

      // Create new categories for names that don't exist
      const newCategories = await Promise.all(
        newCategoryNames.map((name) => Category.findOrCreate(name, false))
      );

      // Combine all category IDs
      const allCategoryIds = [
        ...currentCategoryIds,
        ...categoryIds,
        ...existingCategories.map((cat) => cat._id.toString()),
        ...newCategories.map((cat) => cat._id.toString()),
      ];

      // Remove duplicates
      const uniqueCategoryIds = [...new Set(allCategoryIds)];

      if (uniqueCategoryIds.length === 0) {
        return sendErrorResponse({
          res,
          message: "Invalid operation",
          errorCode: "INVALID_CATEGORIES",
          errorDetails: "Pack must have at least one category",
          status: 400,
        });
      }

      // Update stats for removed categories
      if (removeCategoryIds.length > 0) {
        await Category.updateMany(
          { _id: { $in: removeCategoryIds } },
          { $inc: { "stats.packCount": -1 } }
        );
      }

      // Update stats for new categories
      const newCategoryIds = uniqueCategoryIds.filter(
        (id) => !currentCategoryIds.includes(id)
      );

      if (newCategoryIds.length > 0) {
        await Category.updateMany(
          { _id: { $in: newCategoryIds } },
          { $inc: { "stats.packCount": 1 } }
        );
      }

      // Update pack categories
      pack.categories = uniqueCategoryIds.map((id) => new Types.ObjectId(id));
    }

    // Update basic pack fields
    if (name) pack.name = name.trim();
    if (description !== undefined) pack.description = description.trim();
    if (isPrivate !== undefined) pack.isPrivate = isPrivate;
    if (isAnimatedPack !== undefined) pack.isAnimatedPack = isAnimatedPack;

    // Save changes
    await pack.save();

    const packView = await transformPack(pack);

    return sendSuccessResponse({
      res,
      message: "Pack updated successfully",
      data: packView,
    });
  } catch (err) {
    console.error("Pack update error:", err);

    if (err.code === 11000) {
      return sendErrorResponse({
        res,
        message: "Pack name already exists",
        errorCode: "DUPLICATE_PACK_NAME",
        errorDetails: "A pack with this name already exists.",
        status: 409,
      });
    }

    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while updating the pack.",
      status: 500,
    });
  }
};
