import { Request, Response } from "express";
import { StickerPack } from "../../models/pack_model";
import { Sticker } from "../../models/sticker_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { body, param } from "express-validator";
import { uploadToStorage } from "../../utils/storage_util";
import { STICKER_REQUIREMENTS, PACK_REQUIREMENTS, PLATFORM_CONFIGS } from "../../config/app_requirement";
import { Types } from "mongoose";
import { Category } from "../../models/category_model";
import { createCategoryFromName } from "../categories_controllers/create_category_controller";
import { transformSticker } from "../../utils/responces_templates/response_views_transformer";
import { validateStickerRequirements } from "../../utils/storage_util";

/**
 * Sticker Upload Controller
 *
 * Handles uploading a single sticker to a pack. Both static and animated stickers are supported.
 *
 * Static sticker requirements:
 * - Format: WebP (will be converted if needed)
 * - Dimensions: 512x512 pixels (will be resized if needed)
 * - Max file size: 100KB (will be optimized if needed)
 *
 * Animated sticker requirements:
 * - Input format: GIF
 * - Output format: WebP (will be converted)
 * - Dimensions: 512x512 pixels (will be resized if needed)
 * - Max file size: 500KB (will be optimized if needed)
 * - Max duration: 3 seconds
 * - Recommended FPS: 20 (will be optimized if needed)
 *
 * For animated stickers, set isAnimated=true in the request body.
 */

// Validation rules for sticker upload
export const uploadStickerValidationRules = [
  body("packId").isMongoId().withMessage("Invalid pack ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Sticker name is required")
    .isLength({ max: 128 })
    .withMessage("Sticker name cannot exceed 128 characters"),
  body("emojis").notEmpty().withMessage("Emojis are required"),
  // Add animated validation rule
  body("isAnimated").optional().isBoolean().withMessage("isAnimated must be a boolean value"),
  // Modified categoryIds validation to handle both string and array inputs
  body("categoryIds")
    .optional()
    .custom((value) => {
      if (!value) return true;
      try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(parsed);
      } catch (error) {
        return false;
      }
    })
    .withMessage("Category IDs must be a valid array"),
  // Modified categoryName validation to handle both string and array inputs
  body("categoryName")
    .optional()
    .custom((value) => {
      if (!value) return true;
      try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(parsed) || typeof value === "string";
      } catch (error) {
        return typeof value === "string";
      }
    })
    .withMessage("Category name must be a string or an array of strings"),
];

export const uploadSticker = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { packId, name, categoryIds, categoryName } = req.body;
    let emojis;
    // Extract isAnimated flag more reliably and check file mimetype
    const isGif = req.file && req.file.mimetype === "image/gif";
    const isExpectedAnimated = req.body.isAnimated === "true" || req.body.isAnimated === true || isGif;

    // Validate and parse emojis
    try {
      emojis = Array.isArray(req.body.emojis) ? req.body.emojis : JSON.parse(req.body.emojis);

      if (!Array.isArray(emojis) || emojis.length > STICKER_REQUIREMENTS.maxEmojis) {
        throw new Error(`Invalid emojis format or exceeds maximum of ${STICKER_REQUIREMENTS.maxEmojis} emojis`);
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

    // Validate request
    const validationErrors = await validateRequest(req, res, uploadStickerValidationRules);

    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors) ? validationErrors : undefined,
        errorDetails: Array.isArray(validationErrors) ? validationErrors.join(", ") : validationErrors,
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

    // Validate file is animated if user expects an animated sticker
    if (isExpectedAnimated && !isGif) {
      return sendErrorResponse({
        res,
        message: "Invalid file format",
        errorCode: "INVALID_FORMAT",
        errorDetails: "Animated stickers must be uploaded as GIF files.",
        status: 400,
      });
    }

    // Find and validate pack with proper population
    const pack = await StickerPack.findById(packId).populate("categories").populate("creator");

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist.",
        status: 404,
      });
    }

    // Check if pack allows this type of sticker, but if there are no stickers yet, allow setting the pack type
    if (pack.stickers.length > 0 && pack.isAnimatedPack !== undefined && pack.isAnimatedPack !== isExpectedAnimated) {
      const packType = pack.isAnimatedPack ? "animated" : "static";
      const stickerType = isExpectedAnimated ? "animated" : "static";
      return sendErrorResponse({
        res,
        message: "Sticker type mismatch",
        errorCode: "TYPE_MISMATCH",
        errorDetails: `Cannot add ${stickerType} sticker to ${packType} pack.`,
        status: 400,
      });
    }

    // Check ownership
    const isCreator = pack.creator._id.toString() === userId;

    if (!isCreator) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You do not have permission to add stickers to this pack.",
        status: 403,
      });
    }

    // Parse categoryIds
    let parsedCategoryIds: string[] = [];
    if (categoryIds) {
      try {
        parsedCategoryIds = Array.isArray(categoryIds) ? categoryIds : JSON.parse(categoryIds);

        if (!Array.isArray(parsedCategoryIds)) {
          return sendErrorResponse({
            res,
            message: "Invalid category IDs format",
            errorCode: "INVALID_CATEGORIES",
            errorDetails: "Category IDs must be an array",
            status: 400,
          });
        }
      } catch (error) {
        return sendErrorResponse({
          res,
          message: "Invalid category IDs format",
          errorCode: "INVALID_CATEGORIES",
          errorDetails: "Failed to parse category IDs",
          status: 400,
        });
      }
    }

    // Parse categoryNames
    let parsedCategoryNames: string[] = [];
    if (categoryName) {
      try {
        parsedCategoryNames = Array.isArray(categoryName) ? categoryName : JSON.parse(categoryName);

        if (!Array.isArray(parsedCategoryNames)) {
          return sendErrorResponse({
            res,
            message: "Invalid category names format",
            errorCode: "INVALID_CATEGORIES",
            errorDetails: "Category names must be an array",
            status: 400,
          });
        }
      } catch (error) {
        // If parsing fails, treat it as a single category name
        parsedCategoryNames = [categoryName];
      }
    }

    // Initialize empty categories array
    let stickerCategories: Types.ObjectId[] = [];

    // First try user provided category IDs
    if (parsedCategoryIds.length > 0) {
      const categoryObjectIds = parsedCategoryIds.map((id) => new Types.ObjectId(id));
      const categories = await Category.find({
        _id: { $in: categoryObjectIds },
        isActive: true,
      });

      if (categories.length !== parsedCategoryIds.length) {
        return sendErrorResponse({
          res,
          message: "Invalid categories",
          errorCode: "INVALID_CATEGORIES",
          errorDetails: "One or more category IDs are invalid or inactive",
          status: 400,
        });
      }

      stickerCategories = categories.map((cat) => cat.id);
    }
    // Then try category names if no valid IDs were provided
    else if (parsedCategoryNames.length > 0) {
      try {
        const categoryPromises = parsedCategoryNames.map((name) => createCategoryFromName(name.trim(), true));
        const categoryIds = await Promise.all(categoryPromises);
        stickerCategories = categoryIds;
      } catch (error) {
        return sendErrorResponse({
          res,
          message: "Failed to create categories",
          errorCode: "CATEGORY_CREATION_FAILED",
          errorDetails: error.message,
          status: 400,
        });
      }
    }
    // If no user categories were provided, use pack categories as fallback
    else if (pack.categories && pack.categories.length > 0) {
      stickerCategories = pack.categories.map((cat) => cat._id);
    }
    // Last resort: create category from sticker name
    else {
      const categoryId = await createCategoryFromName(name.trim(), true);
      stickerCategories = [categoryId];
    }

    // Validate final categories array
    if (stickerCategories.length === 0) {
      return sendErrorResponse({
        res,
        message: "No valid categories",
        errorCode: "NO_CATEGORIES",
        errorDetails: "Sticker must have at least one category",
        status: 400,
      });
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

    // Upload sticker with platform specification
    console.log(`Uploading ${isExpectedAnimated ? "animated" : "static"} sticker, file type: ${req.file.mimetype}`);
    // Only create tray icon if this is the first sticker in a pack
    const needsTrayIcon = pack.stickers.length === 0 || !pack.trayIcon;
    const uploadResult = await uploadToStorage(req.file, `stickers/${packId}`, needsTrayIcon);

    if (!uploadResult.success) {
      return sendErrorResponse({
        res,
        message: "Upload failed",
        errorCode: "UPLOAD_FAILED",
        errorDetails: "Failed to process and upload the sticker.",
        status: 500,
      });
    }

    // If this is the first sticker in the pack, set pack type based on sticker
    if (pack.stickers.length === 0) {
      pack.isAnimatedPack = uploadResult.isAnimated;
      await pack.save();
    }

    // Update pack tray icon if not set
    if (!pack.trayIcon) {
      // Use the WhatsApp-optimized tray icon if available, otherwise fall back to the sticker URL
      pack.trayIcon = uploadResult.trayIconUrl || uploadResult.url;
      await pack.save();
    }

    // Create sticker document
    const sticker = new Sticker({
      packId: pack._id,
      name: name.trim(),
      emojis,
      thumbnailUrl: uploadResult.url,
      webpUrl: uploadResult.url,
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
    await Category.updateMany({ _id: { $in: stickerCategories } }, { $inc: { "stats.stickerCount": 1 } });

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
      errorDetails: err.message || "An unexpected error occurred while uploading the sticker.",
      status: 500,
    });
  }
};

/**
 * Validates if a sticker meets WhatsApp requirements without uploading it
 * This helps clients check if their sticker will be accepted before sending it
 */
export const validateSticker = async (req: Request, res: Response) => {
  try {
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

    const isAnimated = req.body.isAnimated === "true" || req.body.isAnimated === true;

    // Validate the sticker
    const validationResult = await validateStickerRequirements(req.file, isAnimated);

    if (validationResult.valid) {
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Sticker meets WhatsApp requirements",
        data: {
          valid: true,
          metadata: validationResult.metadata,
          optimizationRequired:
            validationResult.metadata.size >
            (isAnimated ? PLATFORM_CONFIGS.whatsapp.animated.maxSize * 0.9 : PLATFORM_CONFIGS.whatsapp.static.maxSize * 0.9),
        },
      });
    } else {
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Sticker validation failed",
        data: {
          valid: false,
          issues: validationResult.issues,
          metadata: validationResult.metadata,
        },
      });
    }
  } catch (error) {
    return sendErrorResponse({
      res,
      message: "Validation error",
      errorCode: "VALIDATION_ERROR",
      errorDetails: error.message,
      status: 500,
    });
  }
};
