import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import { Sticker } from "../../../models/sticker_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { body, param } from "express-validator";
import { GENERAL_REQUIREMENTS } from "../../../interfaces/sticker_interface";
import { uploadToStorage } from "../../../utils/storage_util";
import { ISticker } from "../../../interfaces/sticker_interface";
import multer from "multer";
import { PACK_REQUIREMENTS } from "../../../interfaces/pack_interface";
import sharp from "sharp";

export const uploadStickerValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Sticker name is required")
    .isLength({ max: 128 })
    .withMessage("Sticker name cannot exceed 128 characters"),
  body("emojis").notEmpty().withMessage("Emojis are required"),
];

export const uploadSticker = async (req: Request, res: Response) => {
  try {
    console.log("Request Body:", req.body);
    console.log("File:", req.file);
    console.log("Emojis received:", req.body.emojis);

    const userId = req.user.id;
    const { packId } = req.params;
    const { name } = req.body;
    let emojis;

    try {
      emojis = Array.isArray(req.body.emojis)
        ? req.body.emojis
        : JSON.parse(req.body.emojis);

      if (!Array.isArray(emojis) || emojis.length > 3) {
        throw new Error("Invalid emojis format or too many emojis");
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

    const validationErrors = await validateRequest(
      req,
      res,
      uploadStickerValidationRules
    );

    if (validationErrors !== "validation successful") {
      console.log("Validation Errors:", validationErrors);
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

    if (!req.file) {
      return sendErrorResponse({
        res,
        message: "No file uploaded",
        errorCode: "NO_FILE",
        errorDetails: "Please provide a sticker image file in the request.",
        status: 400,
      });
    }

    // Find and validate pack
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist.",
        status: 404,
      });
    }

    // Check if pack animation type is supported
    const metadata = await sharp(req.file.buffer).metadata();
    const isAnimated =
      req.file.mimetype.includes("gif") || metadata.pages !== undefined;
    if (pack.isAnimatedPack && !isAnimated) {
      return sendErrorResponse({
        res,
        message: "Invalid file type",
        errorCode: "INVALID_FILE_TYPE",
        errorDetails: "Static stickers are not allowed in animated packs.",
        status: 400,
      });
    }
    if (!pack.isAnimatedPack && isAnimated) {
      return sendErrorResponse({
        res,
        message: "Invalid file type",
        errorCode: "INVALID_FILE_TYPE",
        errorDetails: "Animated stickers are not allowed in static packs.",
        status: 400,
      });
    }

    if (pack.stickers.length >= PACK_REQUIREMENTS.maxStickers) {
      return sendErrorResponse({
        res,
        message: "Pack is full",
        errorCode: "PACK_FULL",
        errorDetails: `Pack cannot contain more than ${PACK_REQUIREMENTS.maxStickers} stickers.`,
        status: 400,
      });
    }

    if (pack.creator._id.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails:
          "You do not have permission to add stickers to this pack.",
        status: 403,
      });
    }

    if (pack.stickers.length >= 30) {
      return sendErrorResponse({
        res,
        message: "Pack is full",
        errorCode: "PACK_FULL",
        errorDetails: "Pack cannot contain more than 30 stickers.",
        status: 400,
      });
    }

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

    console.log("Processing and uploading sticker...");
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

    // Check if the sticker pack has a tray icon if not use the sticker webp image
    if (!pack.trayIcon) {
      pack.trayIcon = uploadResult.url;
    }
    await pack.save();

    console.log("Creating sticker document...");
    const sticker = new Sticker({
      packId: pack._id,
      name: name.trim(),
      emojis: emojis,
      thumbnailUrl: uploadResult.url,
      webpUrl: uploadResult.url,
      isAnimated: uploadResult.isAnimated,
      fileSize: uploadResult.fileSize,
      dimensions: {
        width: uploadResult.width,
        height: uploadResult.height,
      },
      format: uploadResult.format,
    });

    await sticker.save();
    console.log("Sticker saved to database");

    await pack.addSticker(sticker.id);
    console.log("Pack updated with new sticker");

    return sendSuccessResponse<ISticker>({
      res,
      status: 201,
      message: "Sticker uploaded successfully",
      data: sticker.toJSON(),
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

// Multer configuration
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: Math.max(
      GENERAL_REQUIREMENTS.maxFileSize,
      GENERAL_REQUIREMENTS.animatedMaxFileSize
    ),
  },
  fileFilter: (_req, file, cb) => {
    console.log("Received file:", file.mimetype);
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
}).single("stickerImage");

export const handleStickerUpload = (
  req: Request,
  res: Response,
  next: Function
) => {
  upload(req, res, (err) => {
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
        message: "File upload error",
        errorCode: "UPLOAD_ERROR",
        errorDetails: err.message,
        status: 400,
      });
    }
    next();
  });
};
