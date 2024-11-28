import { Request, Response, NextFunction } from "express";
import multer from "multer";
import Image from "../../models/image_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import config from "../../config";
import sharp from "sharp";
import fs from "fs/promises";
import { IImages } from "../../interfaces/image_interface";

export const uploadImage = async (
  uploadType: "single" | "multiple",
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user.id;

  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendErrorResponse({
        res,
        message: "File too large",
        errorCode: "FILE_TOO_LARGE",
        errorDetails: "Image size should not exceed 5MB.",
        status: 400,
      });
    }
    // Handle other multer errors if needed
    return sendErrorResponse({
      res,
      message: "File upload error",
      errorCode: "FILE_UPLOAD_ERROR",
      errorDetails: err.message,
      status: 400,
    });
  } else if (err) {
    // Handle any other errors that might have occurred during upload
    return sendErrorResponse({
      res,
      message: "File upload error",
      errorCode: "FILE_UPLOAD_ERROR",
      errorDetails: err.message,
      status: 500,
    });
  }

  // Check if any files were uploaded
  if (uploadType === "single" && !req.file) {
    return sendErrorResponse({
      res,
      message: "No file uploaded",
      errorCode: "FILE_UPLOAD_ERROR",
      errorDetails: "No file was provided in the request.",
      status: 400,
    });
  } else if (
    uploadType === "multiple" &&
    (!req.files || req.files.length === 0)
  ) {
    return sendErrorResponse({
      res,
      message: "No files uploaded",
      errorCode: "FILE_UPLOAD_ERROR",
      errorDetails: "No files were provided in the request.",
      status: 400,
    });
  }

  const processImage = async (
    file: Express.Multer.File
  ): Promise<IImages | null> => {
    if (!file.mimetype.startsWith("image/")) {
      await fs.unlink(file.path);
      sendErrorResponse({
        res,
        message: "Invalid file type",
        errorCode: "INVALID_FILE_TYPE",
        errorDetails: "Only image files are allowed",
        status: 400,
      });
      return null;
    }

    try {
      const image = sharp(file.path);
      const metadata = await image.metadata();

      const size = Math.min(metadata.width || 0, metadata.height || 0);
      const outputFilePath = file.path + "_cropped";
      if (metadata.format === "png") {
        await image
          .resize(size, size, {
            fit: sharp.fit.cover,
            position: sharp.strategy.entropy,
          })
          .png({ quality: 80 })
          .toFile(outputFilePath);
      } else {
        await image
          .resize(size, size, {
            fit: sharp.fit.cover,
            position: sharp.strategy.entropy,
          })
          .jpeg({ quality: 80 })
          .toFile(outputFilePath);
      }

      // Replace original file with cropped version
      await fs.unlink(file.path);
      await fs.rename(outputFilePath, file.path);

      const imageUrl = `${req.protocol}://${req.get("host")}${
        config.app.apiPrefix
      }/images/${file.filename}`;

      const newImage = new Image({
        userId: userId,
        name: file.originalname,
        url: imageUrl,
      });

      await newImage.save();

      return newImage;
    } catch (error) {
      console.error("Image processing error:", error);
      await fs.unlink(file.path).catch(console.error);
      return null;
    }
  };

  try {
    if (uploadType === "single") {
      // Handle single image upload
      const processedImage = await processImage(req.file!);
      if (!processedImage) {
        return sendErrorResponse({
          res,
          message: "Server error",
          errorCode: "IMAGE_PROCESSING_ERROR",
          errorDetails:
            "An error occurred during image processing, please try again or try a different image.",
          status: 500,
        });
      }

      return sendSuccessResponse({
        res,
        message: "Profile image uploaded successfully",
        data: {
          id: processedImage.id,
          name: processedImage.name,
          url: processedImage.url,
          isDeleted: processedImage.isDeleted,
          deletedAt: processedImage.deletedAt,
          createdAt: processedImage.createdAt,
          updatedAt: processedImage.updatedAt,
        },
        status: 201,
      });
    } else if (uploadType === "multiple") {
      // Handle multiple images upload
      const files = req.files as Express.Multer.File[];
      const processedImages = await Promise.all(files.map(processImage));

      const successfulUploads = processedImages.filter(
        (img): img is IImages => img !== null
      );

      if (successfulUploads.length !== files.length) {
        return sendErrorResponse({
          res,
          message: "Server error",
          errorCode: "IMAGE_PROCESSING_ERROR",
          errorDetails:
            "An error occurred during image processing for some images.",
          status: 500,
        });
      }

      return sendSuccessResponse({
        res,
        message: "Parcel images uploaded successfully",
        data: successfulUploads.map((img) => {
          return {
            id: img.id,
            name: img.name,
            url: img.url,
            isDeleted: img.isDeleted,
            deletedAt: img.deletedAt,
            createdAt: img.createdAt,
            updatedAt: img.updatedAt,
          };
        }),
        status: 201,
      });
    }
  } catch (error) {
    console.error("Image processing error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred.",
      status: 500,
    });
  }
};
