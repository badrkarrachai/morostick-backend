import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import { Category } from "../../../models/category_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { body } from "express-validator";
import { PACK_REQUIREMENTS } from "../../../config/app_requirement";
import { Types } from "mongoose";
import { transformPack } from "../../../utils/responces_templates/response_views_transformer";

export const createPackValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Pack name is required")
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
    .exists()
    .withMessage("Private pack status is required")
    .isBoolean()
    .withMessage("Invalid private pack status"),
  body("categoryIds")
    .optional()
    .isArray()
    .withMessage("Category IDs must be an array"),
  body("categoryIds.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid category ID format"),
  body("categoryNames") // Updated to handle array of names
    .optional()
    .isArray()
    .withMessage("Category names must be an array"),
  body("categoryName") // Keep single name support for backward compatibility
    .optional()
    .isString()
    .trim(),
];

export const createPack = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const {
    name,
    description,
    isAnimatedPack,
    isPrivate,
    categoryIds,
    categoryNames,
    categoryName,
  } = req.body;

  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      createPackValidationRules
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

    try {
      // Handle all category assignment scenarios
      const packCategories = await Category.assignCategories({
        categoryIds,
        categoryNames: categoryName ? [categoryName] : categoryNames,
        fallbackName: name, // Use pack name as fallback
      });

      // Create the pack
      const pack = new StickerPack({
        name: name.trim(),
        description: description?.trim(),
        creator: [new Types.ObjectId(userId)],
        stickers: [],
        categories: packCategories,
        isPrivate: isPrivate,
        isAuthorized: false,
        isAnimatedPack: isAnimatedPack ?? false,
        stats: {
          downloads: 0,
          views: 0,
          favorites: 0,
        },
      });

      // Save the pack
      await pack.save();

      // Update category stats in parallel
      await Promise.all(
        packCategories.map((categoryId) =>
          Category.findByIdAndUpdate(categoryId, {
            $inc: { "stats.packCount": 1 },
          })
        )
      );

      const packView = await transformPack(pack);

      return sendSuccessResponse({
        res,
        status: 201,
        message: "Sticker pack created successfully",
        data: packView,
      });
    } catch (error) {
      if (error.message === "No valid categories could be assigned") {
        return sendErrorResponse({
          res,
          message: "Category assignment failed",
          errorCode: "CATEGORY_ASSIGNMENT_FAILED",
          errorDetails: "Could not assign or create any valid categories",
          status: 400,
        });
      }
      throw error; // Re-throw other errors
    }
  } catch (err) {
    console.error("Pack creation error:", err);

    if (err.code === 11000) {
      return sendErrorResponse({
        res,
        message: "Pack name already exists",
        errorCode: "DUPLICATE_PACK_NAME",
        errorDetails:
          "A pack with this name already exists. Please choose a different name.",
        status: 409,
      });
    }

    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while creating the pack. Please try again later.",
      status: 500,
    });
  }
};
