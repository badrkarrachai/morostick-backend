import { Request, Response } from "express";
import { Types } from "mongoose";
import User from "../../../models/users_model";
import Image, { IImages } from "../../../models/image_model";
import { uploadAvatar, deleteOldAvatar } from "../../../utils/storage_util";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { IUser } from "../../../interfaces/user_interface";

interface UserWithPopulatedAvatar extends Omit<IUser, "avatar"> {
  avatar?: IImages;
}

export const updateUserAvatar = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return sendErrorResponse({
        res,
        message: "No file uploaded",
        errorCode: "NO_FILE",
        errorDetails: "Please provide an avatar image file",
        status: 400,
      });
    }

    // Get user and their current avatar
    const user = await User.findById(userId).populate<UserWithPopulatedAvatar>(
      "avatar"
    );
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The requested user does not exist",
        status: 404,
      });
    }

    // Upload new avatar to R2
    const uploadResult = await uploadAvatar(req.file, userId);

    // Create new image document
    const newImage = new Image({
      userId: new Types.ObjectId(userId),
      name: `${user.name}'s avatar`,
      url: uploadResult.url,
    });
    await newImage.save();

    // If user has an existing avatar, handle cleanup
    if (user.avatar) {
      // Delete old avatar from R2
      await deleteOldAvatar(userId, user.avatar.url);

      // Mark old avatar image as deleted in database
      await Image.findByIdAndUpdate(user.avatar._id, {
        isDeleted: true,
        deletedAt: new Date(),
      });
    }

    // Update user's avatar reference
    user.avatar = newImage.id;
    await user.save();

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Avatar updated successfully",
      data: {
        avatarId: newImage._id,
        avatarUrl: uploadResult.url,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        fileSize: uploadResult.fileSize,
      },
    });
  } catch (error) {
    console.error("Avatar update error:", error);
    return sendErrorResponse({
      res,
      message: "Failed to update avatar",
      errorCode: "AVATAR_UPDATE_ERROR",
      errorDetails:
        error.message ||
        "An unexpected error occurred while updating the avatar",
      status: 500,
    });
  }
};

export const deleteUserAvatar = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    // Get user and their current avatar
    const user = await User.findById(userId).populate<UserWithPopulatedAvatar>(
      "avatar"
    );
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The requested user does not exist",
        status: 404,
      });
    }

    // Check if user has an avatar
    if (!user.avatar) {
      return sendErrorResponse({
        res,
        message: "No avatar to delete",
        errorCode: "NO_AVATAR",
        errorDetails: "User does not have an avatar to delete",
        status: 400,
      });
    }

    // Delete avatar from R2
    const deleteResult = await deleteOldAvatar(userId, user.avatar.url);
    if (!deleteResult) {
      return sendErrorResponse({
        res,
        message: "Failed to delete avatar",
        errorCode: "AVATAR_DELETE_ERROR",
        errorDetails: "Failed to delete avatar from storage",
        status: 500,
      });
    }

    // Mark image as deleted in database
    await Image.findByIdAndUpdate(user.avatar._id, {
      isDeleted: true,
      deletedAt: new Date(),
    });

    // Remove avatar reference from user
    user.avatar = undefined;
    await user.save();

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Avatar deleted successfully",
    });
  } catch (error) {
    console.error("Avatar deletion error:", error);
    return sendErrorResponse({
      res,
      message: "Failed to delete avatar",
      errorCode: "AVATAR_DELETE_ERROR",
      errorDetails:
        error.message ||
        "An unexpected error occurred while deleting the avatar",
      status: 500,
    });
  }
};

export default {
  updateUserAvatar,
  deleteUserAvatar,
};
