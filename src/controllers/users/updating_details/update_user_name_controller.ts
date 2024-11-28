import { Request, Response } from "express";
import User from "../../../models/users_model";
import validator from "validator";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../../../utils/response_handler_util";
import {
  updateProfileNameValidationRules,
  validateRequest,
} from "../../../utils/validations_util";

export const updateUserName = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { email, name } = req.body;
  try {
    // Validation
    const validationErrors = await validateRequest(
      req,
      res,
      updateProfileNameValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorDetails: validationErrors,
        status: 400,
      });
    }

    // Sanitize and validate inputs
    const sanitizedName = validator.trim(validator.escape(name));
    const sanitizedEmail = validator.normalizeEmail(email) || "";

    // Check if user exists
    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return sendErrorResponse({
        res: res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "No user found with the provided current email",
        status: 404,
      });
    }

    // Check if user is trying to update their own name
    if (userId !== user.id) {
      return sendErrorResponse({
        res: res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You are not authorized to update this user's name.",
        status: 401,
      });
    }

    // Check if the new name is different from the current name
    if (user.name === sanitizedName) {
      return sendErrorResponse({
        res: res,
        message: "New name must be different",
        errorCode: "SAME_NAME",
        errorDetails: "The new name must be different from the current name",
      });
    }

    // Update user name
    user.name = sanitizedName;
    await user.save();

    // Send response
    sendSuccessResponse({
      res: res,
      message: "User name updated successfully",
      data: { name: sanitizedName },
    });
  } catch (err) {
    console.error("User name update error:", err);
    return sendErrorResponse({
      res: res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while updating the name, Please try again later.",
      status: 500,
    });
  }
};
