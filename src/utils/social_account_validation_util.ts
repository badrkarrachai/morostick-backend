import { sendErrorResponse } from "./response_handler_util";
import User from "../models/users_model";
import { Response } from "express";

export interface SocialAccountValidationResult {
  isValid: boolean;
  errorResponse?: any;
}

/**
 * Validates if a Google ID is already linked to another account
 * @param googleId - The Google ID to validate
 * @param currentUserEmail - Email of the current user (if any)
 * @param res - Express response object
 * @returns Validation result object
 */
export const validateGoogleIdLinking = async (
  googleId: string,
  currentUserEmail: string | null,
  res: Response
): Promise<SocialAccountValidationResult> => {
  try {
    // Check if this Google ID is already linked to another account
    const existingUserWithGoogleId = await User.findOne({
      googleId,
      // Exclude the current user if email is provided
      ...(currentUserEmail && { email: { $ne: currentUserEmail } }),
    });

    if (existingUserWithGoogleId) {
      const errorResponse = sendErrorResponse({
        res,
        message: "Google account already linked to another user",
        errorCode: "GOOGLE_ACCOUNT_ALREADY_LINKED",
        errorDetails:
          "This Google account is already associated with another user account. Please use a different Google account or contact support.",
        status: 409,
      });

      return {
        isValid: false,
        errorResponse,
      };
    }

    return { isValid: true };
  } catch (error) {
    const errorResponse = sendErrorResponse({
      res,
      message: "Failed to validate Google account",
      errorCode: "VALIDATION_ERROR",
      errorDetails: `Error during Google account validation: ${error.message}`,
      status: 500,
    });

    return {
      isValid: false,
      errorResponse,
    };
  }
};

/**
 * Validates if a Facebook ID is already linked to another account
 * @param facebookId - The Facebook ID to validate
 * @param currentUserEmail - Email of the current user (if any)
 * @param res - Express response object
 * @returns Validation result object
 */
export const validateFacebookIdLinking = async (
  facebookId: string,
  currentUserEmail: string | null,
  res: Response
): Promise<SocialAccountValidationResult> => {
  try {
    // Check if this Facebook ID is already linked to another account
    const existingUserWithFacebookId = await User.findOne({
      facebookId,
      // Exclude the current user if email is provided
      ...(currentUserEmail && { email: { $ne: currentUserEmail } }),
    });

    if (existingUserWithFacebookId) {
      const errorResponse = sendErrorResponse({
        res,
        message: "Facebook account already linked to another user",
        errorCode: "FACEBOOK_ACCOUNT_ALREADY_LINKED",
        errorDetails:
          "This Facebook account is already associated with another user account. Please use a different Facebook account or contact support.",
        status: 409,
      });

      return {
        isValid: false,
        errorResponse,
      };
    }

    return { isValid: true };
  } catch (error) {
    const errorResponse = sendErrorResponse({
      res,
      message: "Failed to validate Facebook account",
      errorCode: "VALIDATION_ERROR",
      errorDetails: `Error during Facebook account validation: ${error.message}`,
      status: 500,
    });

    return {
      isValid: false,
      errorResponse,
    };
  }
};

/**
 * Validates if any social account ID is already linked to another account
 * @param socialIds - Object containing social IDs to validate
 * @param currentUserEmail - Email of the current user (if any)
 * @param res - Express response object
 * @returns Validation result object
 */
export const validateSocialAccountLinking = async (
  socialIds: {
    googleId?: string;
    facebookId?: string;
    appleId?: string;
  },
  currentUserEmail: string | null,
  res: Response
): Promise<SocialAccountValidationResult> => {
  try {
    const { googleId, facebookId, appleId } = socialIds;

    // Validate Google ID if provided
    if (googleId) {
      const googleValidation = await validateGoogleIdLinking(googleId, currentUserEmail, res);
      if (!googleValidation.isValid) {
        return googleValidation;
      }
    }

    // Validate Facebook ID if provided
    if (facebookId) {
      const facebookValidation = await validateFacebookIdLinking(facebookId, currentUserEmail, res);
      if (!facebookValidation.isValid) {
        return facebookValidation;
      }
    }

    // Add Apple ID validation here if needed in the future
    if (appleId) {
      const existingUserWithAppleId = await User.findOne({
        appleId,
        ...(currentUserEmail && { email: { $ne: currentUserEmail } }),
      });

      if (existingUserWithAppleId) {
        const errorResponse = sendErrorResponse({
          res,
          message: "Apple account already linked to another user",
          errorCode: "APPLE_ACCOUNT_ALREADY_LINKED",
          errorDetails:
            "This Apple account is already associated with another user account. Please use a different Apple account or contact support.",
          status: 409,
        });

        return {
          isValid: false,
          errorResponse,
        };
      }
    }

    return { isValid: true };
  } catch (error) {
    const errorResponse = sendErrorResponse({
      res,
      message: "Failed to validate social accounts",
      errorCode: "VALIDATION_ERROR",
      errorDetails: `Error during social account validation: ${error.message}`,
      status: 500,
    });

    return {
      isValid: false,
      errorResponse,
    };
  }
};
