import { Request, Response, NextFunction } from "express";
import multer from "multer";
import sharp from "sharp";
import { sendErrorResponse } from "../../utils/response_handler_util";
import {
  STICKER_REQUIREMENTS,
  UPLOAD_USER_AVATAR_REQUIREMENTS,
} from "../../config/app_requirement";

// Map file extensions to MIME types
const MIME_TYPES = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  gif: "image/gif",
};

// Configure multer storage
const storage = multer.memoryStorage();

// Create multer instances for different upload types
const createUploader = (type: "sticker" | "avatar") => {
  const config =
    type === "sticker" ? STICKER_REQUIREMENTS : UPLOAD_USER_AVATAR_REQUIREMENTS;

  return multer({
    storage,
    limits: {
      fileSize:
        type === "sticker"
          ? Math.max(
              STICKER_REQUIREMENTS.maxFileSize,
              STICKER_REQUIREMENTS.animatedMaxFileSize
            )
          : UPLOAD_USER_AVATAR_REQUIREMENTS.maxSize,
    },
    fileFilter: (req, file, cb) => {
      const fileType = file.mimetype.split("/")[1];
      const isValidType = config.allowedFormats.includes(fileType);

      if (!isValidType) {
        cb(
          new Error(
            `Invalid file type. Allowed formats: ${config.allowedFormats.join(
              ", "
            )}`
          )
        );
        return;
      }

      cb(null, true);
    },
  });
};

const stickerUpload = createUploader("sticker").single("stickerImage");
const avatarUpload = createUploader("avatar").single("avatarImage");

// Helper function to validate dimensions
function validateDimensions(
  width: number,
  height: number,
  type: "sticker" | "avatar"
): { isValid: boolean; error?: string } {
  const config =
    type === "sticker"
      ? STICKER_REQUIREMENTS.dimensions
      : UPLOAD_USER_AVATAR_REQUIREMENTS.dimensions;

  if (width < config.minWidth || height < config.minHeight) {
    return {
      isValid: false,
      error: `Image dimensions must be at least ${config.minWidth}x${config.minHeight} pixels`,
    };
  }

  if (width > config.maxWidth || height > config.maxHeight) {
    return {
      isValid: false,
      error: `Image dimensions cannot exceed ${config.maxWidth}x${config.maxHeight} pixels`,
    };
  }

  return { isValid: true };
}

// Generic file processing middleware
async function processUploadedFile(
  req: Request,
  res: Response,
  type: "sticker" | "avatar"
) {
  if (!req.file) {
    return sendErrorResponse({
      res,
      message: "No file uploaded",
      errorCode: "FILE_REQUIRED",
      errorDetails: `Please provide ${
        type === "sticker" ? "a sticker" : "an avatar"
      } image file`,
      status: 400,
    });
  }

  try {
    const metadata = await sharp(req.file.buffer).metadata();

    const isAnimated =
      req.file.mimetype === "image/gif" || metadata.pages !== undefined;

    // Validate file size
    const maxSize =
      type === "sticker"
        ? isAnimated
          ? STICKER_REQUIREMENTS.animatedMaxFileSize
          : STICKER_REQUIREMENTS.maxFileSize
        : UPLOAD_USER_AVATAR_REQUIREMENTS.maxSize;

    if (req.file.size > maxSize) {
      return sendErrorResponse({
        res,
        message: "File too large",
        errorCode: "FILE_TOO_LARGE",
        errorDetails: `File size exceeds ${maxSize / (1024 * 1024)}MB limit`,
        status: 400,
      });
    }

    // Validate dimensions
    if (metadata.width && metadata.height) {
      const dimensionsValid = validateDimensions(
        metadata.width,
        metadata.height,
        type
      );
      if (!dimensionsValid.isValid) {
        return sendErrorResponse({
          res,
          message: "Invalid dimensions",
          errorCode: "INVALID_DIMENSIONS",
          errorDetails: dimensionsValid.error!,
          status: 400,
        });
      }
    }

    // Add metadata to request
    req.fileMetadata = {
      isAnimated,
      width: metadata.width!,
      height: metadata.height!,
      format: metadata.format,
      uploadType: type,
    };

    return null; // No error
  } catch (error) {
    return sendErrorResponse({
      res,
      message: "Image processing error",
      errorCode: "PROCESSING_ERROR",
      errorDetails: "Failed to process the uploaded image",
      status: 400,
    });
  }
}

// Middleware to handle sticker upload
export const uploadStickerFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  stickerUpload(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        return sendErrorResponse({
          res,
          message: "File upload error",
          errorCode: "UPLOAD_ERROR",
          errorDetails:
            err.code === "LIMIT_FILE_SIZE"
              ? "File size exceeds the maximum limit"
              : err.message,
          status: 400,
        });
      } else if (err) {
        return sendErrorResponse({
          res,
          message: "Invalid file",
          errorCode: "INVALID_FILE",
          errorDetails: err.message,
          status: 400,
        });
      }

      const error = await processUploadedFile(req, res, "sticker");
      if (error) return error;

      next();
    } catch (error) {
      console.error("Upload middleware error:", error);
      return sendErrorResponse({
        res,
        message: "Server error",
        errorCode: "SERVER_ERROR",
        errorDetails:
          "An unexpected error occurred while processing the upload",
        status: 500,
      });
    }
  });
};

// Middleware to handle avatar upload
export const uploadAvatarFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  avatarUpload(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        return sendErrorResponse({
          res,
          message: "File upload error",
          errorCode: "UPLOAD_ERROR",
          errorDetails:
            err.code === "LIMIT_FILE_SIZE"
              ? "File size exceeds the maximum limit"
              : err.message,
          status: 400,
        });
      } else if (err) {
        return sendErrorResponse({
          res,
          message: "Invalid file",
          errorCode: "INVALID_FILE",
          errorDetails: err.message,
          status: 400,
        });
      }

      const error = await processUploadedFile(req, res, "avatar");
      if (error) return error;

      next();
    } catch (error) {
      console.error("Upload middleware error:", error);
      return sendErrorResponse({
        res,
        message: "Server error",
        errorCode: "SERVER_ERROR",
        errorDetails:
          "An unexpected error occurred while processing the upload",
        status: 500,
      });
    }
  });
};

// Updated type declaration for metadata
declare global {
  namespace Express {
    interface Request {
      fileMetadata?: {
        isAnimated: boolean;
        width: number;
        height: number;
        format: string;
        uploadType: "sticker" | "avatar";
      };
    }
  }
}

export default {
  uploadStickerFile,
  uploadAvatarFile,
};
