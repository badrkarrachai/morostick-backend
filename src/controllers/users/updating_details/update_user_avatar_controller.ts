// src/controllers/userController.ts
import { Request, Response } from "express";
import User from "../../../models/users_model";
import Image from "../../../models/image_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { Types } from "mongoose";
import { formatImageData } from "../../../utils/responces_templates/image_response_template";

// Controller to update user profile picture
export const updateUserProfilePicture = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { imageId } = req.body;

  try {
    // Validate the image ID
    if (!Types.ObjectId.isValid(imageId)) {
      return sendErrorResponse({
        res,
        message: "Invalid image ID",
        errorCode: "INVALID_IMAGE_ID",
        errorDetails: "The provided image ID is not valid.",
        status: 400,
      });
    }

    // Find the uploaded image
    const image = await Image.findById(imageId);
    if (!image) {
      return sendErrorResponse({
        res,
        message: "Image not found",
        errorCode: "IMAGE_NOT_FOUND",
        errorDetails: "The image with the specified ID does not exist.",
        status: 404,
      });
    }

    // Find the user and update their avatar field
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails:
          "There is no session with this user id, please login again.",
        status: 404,
      });
    }

    // Update the user's avatar with the image ID
    user.avatar = image.id;
    await user.save();

    return sendSuccessResponse({
      res,
      message: "Profile picture updated successfully",
      data: formatImageData(image),
      status: 200,
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An error occurred while updating the profile picture.",
      status: 500,
    });
  }
};

// Controller to remove user profile picture
export const removeUserProfilePicture = async (req: Request, res: Response) => {
  const userId = req.user.id;

  try {
    // Find the user and update their avatar field
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails:
          "There is no session with this user id, please login again.",
        status: 404,
      });
    }

    // Update the user's avatar with the image ID
    user.avatar = null;
    await user.save();

    return sendSuccessResponse({
      res,
      message: "Profile picture removed successfully",
      status: 200,
    });
  } catch (error) {
    console.error("Error removing profile picture:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An error occurred while removing the profile picture.",
      status: 500,
    });
  }
};
