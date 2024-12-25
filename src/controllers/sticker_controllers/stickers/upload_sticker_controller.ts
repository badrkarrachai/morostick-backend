import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import { Sticker } from "../../../models/sticker_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { body, param } from "express-validator";
import { uploadToStorage } from "../../../utils/storage_util";
import { ISticker } from "../../../interfaces/sticker_interface";
import {
  STICKER_REQUIREMENTS,
  PACK_REQUIREMENTS,
} from "../../../config/app_requirement";
import { Types } from "mongoose";
import { Category } from "../../../models/category_model";
import { createCategoryFromName } from "../../categories_controllers/create_category_controller";
import { transformSticker } from "../../../utils/responces_templates/response_views_transformer";

// Validation rules for sticker upload
export const uploadStickerValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Sticker name is required")
    .isLength({ max: 128 })
    .withMessage("Sticker name cannot exceed 128 characters"),
  body("emojis").notEmpty().withMessage("Emojis are required"),
  body("categoryIds")
    .optional()
    .isArray()
    .withMessage("Category IDs must be an array"),
  body("categoryIds.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid category ID format"),
  body("categoryName")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Category name must be between 2 and 50 characters"),
];

export const uploadSticker = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { packId } = req.params;
    const { name, categoryIds, categoryName } = req.body;
    let emojis;
    let tags;

    // Validate and parse emojis
    try {
      emojis = Array.isArray(req.body.emojis)
        ? req.body.emojis
        : JSON.parse(req.body.emojis);

      if (
        !Array.isArray(emojis) ||
        emojis.length > STICKER_REQUIREMENTS.maxEmojis
      ) {
        throw new Error(
          `Invalid emojis format or exceeds maximum of ${STICKER_REQUIREMENTS.maxEmojis} emojis`
        );
      }
    } catch (error) {
      return sendErrorResponse({
        res,
        message: "Invalid emojis format",
        errorCode: "INVALID_EMOJIS",
        errorDetails: error.message,
        status: 400,
      });
    }

    // Validate and parse tags
    try {
      tags = req.body.tags
        ? Array.isArray(req.body.tags)
          ? req.body.tags
          : JSON.parse(req.body.tags)
        : [];

      if (!Array.isArray(tags) || tags.length > STICKER_REQUIREMENTS.maxTags) {
        throw new Error(
          `Invalid tags format or exceeds maximum of ${STICKER_REQUIREMENTS.maxTags} tags`
        );
      }
    } catch (error) {
      return sendErrorResponse({
        res,
        message: "Invalid tags format",
        errorCode: "INVALID_TAGS",
        errorDetails: error.message,
        status: 400,
      });
    }

    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      uploadStickerValidationRules
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
          : "The provided data is invalid.",
        status: 400,
      });
    }

    // Check file presence
    if (!req.file) {
      return sendErrorResponse({
        res,
        message: "No file uploaded",
        errorCode: "NO_FILE",
        errorDetails: "Please provide a sticker image file in the request.",
        status: 400,
      });
    }

    // Find and validate pack with proper population
    const pack = await StickerPack.findById(packId)
      .populate("categories")
      .populate("creator");

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
    const isCreator =
      pack.creator instanceof Array
        ? pack.creator.some((creator) => creator._id.toString() === userId)
        : pack.creator === userId;

    if (!isCreator) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails:
          "You do not have permission to add stickers to this pack.",
        status: 403,
      });
    }

    // Handle categories assignment
    let stickerCategories: Types.ObjectId[] = [];

    // Use pack categories as base
    if (pack.categories && pack.categories.length > 0) {
      stickerCategories = pack.categories.map((cat) => cat._id);
    }

    // Handle provided category IDs
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const categoryObjectIds = categoryIds.map((id) => new Types.ObjectId(id));
      const categories = await Category.find({
        _id: { $in: categoryObjectIds },
        isActive: true,
      });

      if (categories.length !== categoryIds.length) {
        return sendErrorResponse({
          res,
          message: "Invalid categories",
          errorCode: "INVALID_CATEGORIES",
          errorDetails: "One or more category IDs are invalid or inactive",
          status: 400,
        });
      }

      categories.forEach((cat) => {
        if (
          !stickerCategories.some((existingId) => existingId.equals(cat.id))
        ) {
          stickerCategories.push(cat.id);
        }
      });
    }
    // Handle category name if provided
    else if (categoryName) {
      const categoryId = await createCategoryFromName(
        categoryName.trim(),
        true
      );
      if (
        !stickerCategories.some((existingId) => existingId.equals(categoryId))
      ) {
        stickerCategories.push(categoryId);
      }
    }

    // Create category from sticker name if no categories are assigned
    if (stickerCategories.length === 0) {
      const categoryId = await createCategoryFromName(name.trim(), true);
      stickerCategories.push(categoryId);
    }

    // Validate sticker count
    if (pack.stickers.length >= PACK_REQUIREMENTS.maxStickers) {
      return sendErrorResponse({
        res,
        message: "Pack is full",
        errorCode: "PACK_FULL",
        errorDetails: `Pack cannot contain more than ${PACK_REQUIREMENTS.maxStickers} stickers.`,
        status: 400,
      });
    }

    // Check for duplicate sticker name
    const existingSticker = await Sticker.findOne({
      packId: pack._id,
      name: name.trim(),
    });

    if (existingSticker) {
      return sendErrorResponse({
        res,
        message: "Duplicate sticker name",
        errorCode: "DUPLICATE_NAME",
        errorDetails: "A sticker with this name already exists in the pack.",
        status: 409,
      });
    }

    // Upload sticker
    const uploadResult = await uploadToStorage(req.file, `stickers/${packId}`);

    if (!uploadResult.success) {
      return sendErrorResponse({
        res,
        message: "Upload failed",
        errorCode: "UPLOAD_FAILED",
        errorDetails: "Failed to process and upload the sticker.",
        status: 500,
      });
    }

    // Update pack tray icon if not set
    if (!pack.trayIcon) {
      pack.trayIcon = uploadResult.url;
      await pack.save();
    }

    // Create sticker document
    const sticker = new Sticker({
      packId: pack._id,
      name: name.trim(),
      emojis,
      thumbnailUrl: uploadResult.url,
      webpUrl: uploadResult.url,
      tags: tags.slice(0, STICKER_REQUIREMENTS.maxTags),
      isAnimated: uploadResult.isAnimated,
      fileSize: uploadResult.fileSize,
      creator: new Types.ObjectId(userId),
      dimensions: {
        width: uploadResult.width,
        height: uploadResult.height,
      },
      format: uploadResult.format,
      position: pack.stickers.length,
      categories: stickerCategories,
    });

    await sticker.save();

    // Update categories stats
    await Category.updateMany(
      { _id: { $in: stickerCategories } },
      { $inc: { "stats.stickerCount": 1 } }
    );

    // Add sticker to pack
    await pack.addSticker(sticker.id);

    const stickerView = await transformSticker(sticker);

    return sendSuccessResponse({
      res,
      status: 201,
      message: "Sticker uploaded successfully",
      data: stickerView,
    });
  } catch (err) {
    console.error("Sticker upload error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        err.message ||
        "An unexpected error occurred while uploading the sticker.",
      status: 500,
    });
  }
};
