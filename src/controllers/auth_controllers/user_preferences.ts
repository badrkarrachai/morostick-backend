import { Request, Response } from "express";
import { body } from "express-validator";
import User from "../../models/users_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";

// Validation rules for preferences update
export const updatePreferencesValidationRules = [
  body("currency").optional().isString().isLength({ max: 3 }).withMessage("Currency code must be 3 characters"),
  body("language").optional().isString().isLength({ min: 2, max: 5 }).withMessage("Language code must be between 2-5 characters"),
  body("theme").optional().isIn(["light", "dark"]).withMessage("Theme must be either 'light' or 'dark'"),
  body("isGoogleAuthEnabled").optional().isBoolean().withMessage("Google auth preference must be a boolean"),
  body("isFacebookAuthEnabled").optional().isBoolean().withMessage("Facebook auth preference must be a boolean"),
];

export const updateUserPreferences = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { currency, language, theme, isGoogleAuthEnabled, isFacebookAuthEnabled } = req.body;

    // Validate request
    const validationErrors = await validateRequest(req, res, updatePreferencesValidationRules);
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid preferences data",
        errorCode: "INVALID_PREFERENCES",
        errorFields: Array.isArray(validationErrors) ? validationErrors : undefined,
        errorDetails: Array.isArray(validationErrors) ? validationErrors.join(", ") : validationErrors,
        status: 400,
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The requested user account does not exist",
        status: 404,
      });
    }

    // Check if disabling both auth methods
    if (typeof isGoogleAuthEnabled === "boolean" && typeof isFacebookAuthEnabled === "boolean" && !isGoogleAuthEnabled && !isFacebookAuthEnabled) {
      return sendErrorResponse({
        res,
        message: "Invalid preferences",
        errorCode: "INVALID_AUTH_PREFERENCES",
        errorDetails: "At least one authentication method (Google or Facebook) must be enabled",
        status: 400,
      });
    }

    // Check if disabling the only enabled auth method
    if (
      (typeof isGoogleAuthEnabled === "boolean" && !isGoogleAuthEnabled && !user.preferences.isFacebookAuthEnabled) ||
      (typeof isFacebookAuthEnabled === "boolean" && !isFacebookAuthEnabled && !user.preferences.isGoogleAuthEnabled)
    ) {
      return sendErrorResponse({
        res,
        message: "Invalid preferences",
        errorCode: "INVALID_AUTH_PREFERENCES",
        errorDetails: "Cannot disable the only enabled authentication method",
        status: 400,
      });
    }

    // Update only provided fields
    if (currency) user.preferences.currency = currency;
    if (language) user.preferences.language = language;
    if (theme) user.preferences.theme = theme;
    if (typeof isGoogleAuthEnabled === "boolean") {
      user.preferences.isGoogleAuthEnabled = isGoogleAuthEnabled;
    }
    if (typeof isFacebookAuthEnabled === "boolean") {
      user.preferences.isFacebookAuthEnabled = isFacebookAuthEnabled;
    }

    // Save updated user
    await user.save();

    // Return updated preferences
    return sendSuccessResponse({
      res,
      message: "Preferences updated successfully",
      data: {
        preferences: user.preferences,
      },
    });
  } catch (err) {
    console.error("Preferences update error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while updating preferences",
      status: 500,
    });
  }
};
