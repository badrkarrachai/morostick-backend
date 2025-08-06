import { Request, Response } from "express";
import { Types } from "mongoose";
import User from "../../../models/users_model";
import Image, { IImages } from "../../../models/image_model";
import { uploadCoverImage, deleteOldCoverImage } from "../../../utils/storage_util";
import { sendSuccessResponse, sendErrorResponse } from "../../../utils/response_handler_util";
import { IUser } from "../../../interfaces/user_interface";

interface UserWithPopulatedCoverImage extends Omit<IUser, "coverImage"> {
  coverImage?: IImages;
}

export const updateUserCoverImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return sendErrorResponse({
        res,
        message: "No file uploaded",
        errorCode: "NO_FILE",
        errorDetails: "Please provide a cover image file",
        status: 400,
      });
    }

    // Get user and their current cover image
    const user = await User.findById(userId).populate<UserWithPopulatedCoverImage>("coverImage");
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The requested user does not exist",
        status: 404,
      });
    }

    // Upload new cover image to R2
    const uploadResult = await uploadCoverImage(req.file, userId);

    // Create new image document
    const newImage = new Image({
      userId: new Types.ObjectId(userId),
      name: `${user.name}'s cover image`,
      url: uploadResult.url,
    });
    await newImage.save();

    // If user has an existing cover image, handle cleanup
    if (user.coverImage) {
      // Delete old cover image from R2
      await deleteOldCoverImage(userId, user.coverImage.url);

      // Mark old cover image as deleted in database
      await Image.findByIdAndUpdate(user.coverImage._id, {
        isDeleted: true,
        deletedAt: new Date(),
      });
    }

    // Update user's cover image reference
    user.coverImage = newImage.id;
    await user.save();

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Cover image updated successfully",
      data: {
        coverImageId: newImage._id,
        coverImageUrl: uploadResult.url,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        fileSize: uploadResult.fileSize,
      },
    });
  } catch (error) {
    console.error("Cover image update error:", error);
    return sendErrorResponse({
      res,
      message: "Failed to update cover image",
      errorCode: "COVER_IMAGE_UPDATE_ERROR",
      errorDetails: error.message || "An unexpected error occurred while updating the cover image",
      status: 500,
    });
  }
};

export const deleteUserCoverImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    // Get user and their current cover image
    const user = await User.findById(userId).populate<UserWithPopulatedCoverImage>("coverImage");
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The requested user does not exist",
        status: 404,
      });
    }

    // Check if user has a cover image
    if (!user.coverImage) {
      return sendErrorResponse({
        res,
        message: "No cover image to delete",
        errorCode: "NO_COVER_IMAGE",
        errorDetails: "User does not have a cover image to delete",
        status: 400,
      });
    }

    // Delete cover image from R2
    const deleteResult = await deleteOldCoverImage(userId, user.coverImage.url);
    if (!deleteResult) {
      return sendErrorResponse({
        res,
        message: "Failed to delete cover image",
        errorCode: "COVER_IMAGE_DELETE_ERROR",
        errorDetails: "Failed to delete cover image from storage",
        status: 500,
      });
    }

    // Mark image as deleted in database
    await Image.findByIdAndUpdate(user.coverImage._id, {
      isDeleted: true,
      deletedAt: new Date(),
    });

    // Remove cover image reference from user
    user.coverImage = undefined;
    await user.save();

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Cover image deleted successfully",
    });
  } catch (error) {
    console.error("Cover image deletion error:", error);
    return sendErrorResponse({
      res,
      message: "Failed to delete cover image",
      errorCode: "COVER_IMAGE_DELETE_ERROR",
      errorDetails: error.message || "An unexpected error occurred while deleting the cover image",
      status: 500,
    });
  }
};

export default {
  updateUserCoverImage,
  deleteUserCoverImage,
};
