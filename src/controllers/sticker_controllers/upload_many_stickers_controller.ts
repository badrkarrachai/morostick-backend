import { Request, Response } from "express";
import { StickerPack } from "../../models/pack_model";
import { Sticker } from "../../models/sticker_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { body, param } from "express-validator";
import multer from "multer";
import { uploadToStorage } from "../../utils/storage_util";
import { STICKER_REQUIREMENTS, PACK_REQUIREMENTS } from "../../config/app_requirement";
import { Types } from "mongoose";
import { Category } from "../../models/category_model";
import { transformStickers } from "../../utils/responces_templates/response_views_transformer";

// Configure multer for multiple file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: STICKER_REQUIREMENTS.maxFileSize, // Use your config's max file size
  },
}).array("files", PACK_REQUIREMENTS.maxStickers); // 'files' is the field name, second parameter is max count

// Validation rules for bulk sticker upload
export const bulkUploadStickersValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Base sticker name is required")
    .isLength({ max: 128 })
    .withMessage("Sticker name cannot exceed 128 characters"),
  body("emojis").notEmpty().withMessage("Emojis are required"),
  body("categoryIds").optional().isArray().withMessage("Category IDs must be an array"),
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

// Middleware to handle file upload errors
const handleUpload = (req: Request, res: Response, next: Function) => {
  upload(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      return sendErrorResponse({
        res,
        message: "File upload error",
        errorCode: "UPLOAD_ERROR",
        errorDetails: err.message,
        status: 400,
      });
    } else if (err) {
      return sendErrorResponse({
        res,
        message: "Server error",
        errorCode: "SERVER_ERROR",
        errorDetails: err.message,
        status: 500,
      });
    }
    next();
  });
};

export const bulkUploadStickers = [
  handleUpload,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const { packId } = req.params;
      const { name: baseName, categoryIds, categoryName } = req.body;
      let emojis;

      // Check if user is admin
      if (req.user.role !== "admin") {
        return sendErrorResponse({
          res,
          message: "Unauthorized",
          errorCode: "UNAUTHORIZED",
          errorDetails: "Only administrators can perform bulk uploads",
          status: 403,
        });
      }

      // Parse emojis
      try {
        emojis = Array.isArray(req.body.emojis) ? req.body.emojis : JSON.parse(req.body.emojis);

        if (!Array.isArray(emojis)) {
          throw new Error("Emojis must be an array");
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

      // Check files presence (now handled by multer)
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return sendErrorResponse({
          res,
          message: "No files uploaded",
          errorCode: "NO_FILES",
          errorDetails: "Please provide sticker image files in the request.",
          status: 400,
        });
      }

      // Find and validate pack
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

      // Validate total sticker count
      if (pack.stickers.length + req.files.length > PACK_REQUIREMENTS.maxStickers) {
        return sendErrorResponse({
          res,
          message: "Pack capacity exceeded",
          errorCode: "PACK_CAPACITY_EXCEEDED",
          errorDetails: `Adding ${req.files.length} stickers would exceed the maximum pack size of ${PACK_REQUIREMENTS.maxStickers}`,
          status: 400,
        });
      }

      // Process categories
      const stickerCategories = await Category.assignCategories({
        categoryIds,
        categoryNames: categoryName ? [categoryName] : undefined,
        fallbackName: baseName,
      });

      // Upload and create stickers
      const uploadedStickers = [];
      const errors = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const stickerName = `${baseName}_${i + 1}`;

        try {
          // Check for duplicate name
          const existingSticker = await Sticker.findOne({
            packId: pack._id,
            name: stickerName,
          });

          if (existingSticker) {
            errors.push({
              file: file.originalname,
              error: `Duplicate sticker name: ${stickerName}`,
            });
            continue;
          }

          // Upload sticker
          const needsTrayIcon = !pack.trayIcon && i === 0;
          const uploadResult = await uploadToStorage(file, `stickers/${packId}`, needsTrayIcon);
          if (!uploadResult.success) {
            errors.push({
              file: file.originalname,
              error: "Failed to upload file",
            });
            continue;
          }

          // Create sticker document
          const sticker = new Sticker({
            packId: pack._id,
            name: stickerName,
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
            position: pack.stickers.length + uploadedStickers.length,
            categories: stickerCategories,
          });

          await sticker.save();
          uploadedStickers.push(sticker);

          // Update pack's tray icon if not set and this is the first sticker
          if (!pack.trayIcon && i === 0) {
            // Use the WhatsApp-optimized tray icon if available, otherwise fall back to the sticker URL
            pack.trayIcon = uploadResult.trayIconUrl || uploadResult.url;
            await pack.save();
          }
        } catch (error) {
          errors.push({
            file: file.originalname,
            error: error.message,
          });
        }
      }

      // Update categories stats if any stickers were uploaded
      if (uploadedStickers.length > 0) {
        await Category.updateMany({ _id: { $in: stickerCategories } }, { $inc: { "stats.stickerCount": uploadedStickers.length } });

        // Add stickers to pack
        for (const sticker of uploadedStickers) {
          await pack.addSticker(sticker.id);
        }
      }

      // Transform uploaded stickers for response
      const stickerViews = await transformStickers(uploadedStickers);

      return sendSuccessResponse({
        res,
        status: 201,
        message: `Successfully uploaded ${uploadedStickers.length} stickers${errors.length > 0 ? ` with ${errors.length} errors` : ""}`,
        data: {
          uploadedStickers: stickerViews,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (err) {
      console.error("Bulk sticker upload error:", err);
      return sendErrorResponse({
        res,
        message: "Server error",
        errorCode: "SERVER_ERROR",
        errorDetails: err.message || "An unexpected error occurred while uploading stickers.",
        status: 500,
      });
    }
  },
];
