import { Request, Response } from "express";
import { check, validationResult } from "express-validator";
import User from "../../models/users_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import OTPService from "../../utils/otp_util";
import {
  validateRequest,
  verifyOtpValidationRules,
} from "../../utils/validations_util";
import config from "../../config";

// Step 2: Verify Code
export const verifyOTP = async (req: Request, res: Response) => {
  // Validation
  const validationErrors = await validateRequest(
    req,
    res,
    verifyOtpValidationRules
  );
  if (validationErrors !== "validation successful") {
    return sendErrorResponse({
      res,
      message: "Invalid input",
      errorCode: "INVALID_INPUT",
      errorDetails: Array.isArray(validationErrors)
        ? validationErrors.join(", ")
        : validationErrors,
      status: 400,
    });
  }

  const { email, otp } = req.body;

  try {
    // Get the user with the email
    const user = await User.findOne({ email });

    if (!user) {
      return sendErrorResponse({
        res: res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "No user found with this email address",
        status: 400,
      });
    }

    // Verify Code locally
    const otpRes = await OTPService.verifyOTPLocally(
      user,
      otp,
      config.otp.maxAttempts
    );
    if (!otpRes.isValid) {
      return sendErrorResponse({
        res: res,
        message: otpRes.message,
        errorCode: otpRes.status,
        errorDetails: otpRes.details,
      });
    }

    // Code is valid
    return sendSuccessResponse({
      res: res,
      message: "Code verified successfully",
      status: 200,
    });
  } catch (err) {
    console.error("Code verification error:", err);
    return sendErrorResponse({
      res: res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred during Code verification, Please try again later.",
      status: 500,
    });
  }
};
