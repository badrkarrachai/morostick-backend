import { Request, Response, NextFunction } from "express";
import multer from "multer";
import sharp from "sharp";
import { sendErrorResponse } from "../../utils/response_handler_util";
import { STICKER_REQUIREMENTS } from "../../config/app_requirement";

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

// Create multer instance with largest possible file size
const upload = multer({
  storage,
  limits: {
    fileSize: Math.max(
      STICKER_REQUIREMENTS.maxFileSize,
      STICKER_REQUIREMENTS.animatedMaxFileSize
    ),
  },
  fileFilter: (req, file, cb) => {
    // Convert mime type to extension
    const fileType = file.mimetype.split("/")[1];
    const isValidType = STICKER_REQUIREMENTS.allowedFormats.includes(fileType);

    if (!isValidType) {
      cb(
        new Error(
          `Invalid file type. Allowed formats: ${STICKER_REQUIREMENTS.allowedFormats.join(
            ", "
          )}`
        )
      );
      return;
    }

    cb(null, true);
  },
}).single("stickerImage"); // Match the field name from your frontend

// Middleware to handle file upload and validation
export const uploadStickerFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  upload(req, res, async (err) => {
    try {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        return sendErrorResponse({
          res,
          message: "File upload error",
          errorCode: "UPLOAD_ERROR",
          errorDetails:
            err.code === "LIMIT_FILE_SIZE"
              ? `File size exceeds the maximum limit`
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

      // Check if file exists
      if (!req.file) {
        return sendErrorResponse({
          res,
          message: "No file uploaded",
          errorCode: "FILE_REQUIRED",
          errorDetails: "Please provide a sticker image file",
          status: 400,
        });
      }

      try {
        // Get image metadata using sharp
        const metadata = await sharp(req.file.buffer).metadata();

        // Determine if the image is animated
        const isAnimated =
          req.file.mimetype === "image/gif" || metadata.pages !== undefined;

        // Validate file size based on animation type
        const maxSize = isAnimated
          ? STICKER_REQUIREMENTS.animatedMaxFileSize
          : STICKER_REQUIREMENTS.maxFileSize;

        if (req.file.size > maxSize) {
          return sendErrorResponse({
            res,
            message: "File too large",
            errorCode: "FILE_TOO_LARGE",
            errorDetails: `File size exceeds ${
              maxSize / (1024 * 1024)
            }MB limit for ${isAnimated ? "animated" : "static"} stickers`,
            status: 400,
          });
        }

        // Validate dimensions
        if (metadata.width && metadata.height) {
          const dimensionsValid = validateDimensions(
            metadata.width,
            metadata.height
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

        // Add metadata to request for later use
        req.stickerMetadata = {
          isAnimated,
          width: metadata.width!,
          height: metadata.height!,
          format: metadata.format,
        };

        next();
      } catch (error) {
        return sendErrorResponse({
          res,
          message: "Image processing error",
          errorCode: "PROCESSING_ERROR",
          errorDetails: "Failed to process the uploaded image",
          status: 400,
        });
      }
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

// Helper function to validate image dimensions
function validateDimensions(
  width: number,
  height: number
): { isValid: boolean; error?: string } {
  const { dimensions } = STICKER_REQUIREMENTS;

  if (width < dimensions.minWidth || height < dimensions.minHeight) {
    return {
      isValid: false,
      error: `Image dimensions must be at least ${dimensions.minWidth}x${dimensions.minHeight} pixels`,
    };
  }

  if (width > dimensions.maxWidth || height > dimensions.maxHeight) {
    return {
      isValid: false,
      error: `Image dimensions cannot exceed ${dimensions.maxWidth}x${dimensions.maxHeight} pixels`,
    };
  }

  return { isValid: true };
}

// Type declaration for the added metadata
declare global {
  namespace Express {
    interface Request {
      stickerMetadata?: {
        isAnimated: boolean;
        width: number;
        height: number;
        format: string;
      };
    }
  }
}

export default uploadStickerFile;
