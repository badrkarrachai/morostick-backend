import { Request, Response } from "express";
import User from "../../models/users_model";
import { prepareMobileAuthResponse } from "../../utils/jwt_util";
import config from "../../config";
import bcrypt from "bcrypt";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import OTPService from "../../utils/otp_util";
import {
  requestPasswordResetValidationRules,
  resetPasswordValidationRules,
  validateRequest,
} from "../../utils/validations_util";
import { checkAccountRecoveryStatus } from "../../utils/account_deletion_check_util";
import { formatUserData } from "../../utils/responces_templates/user_auth_response_template";
import { OTPOptions } from "../../interfaces/otp_options";

// Request password reset
export const requestPasswordReset = async (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    // Validation
    const validationErrors = await validateRequest(
      req,
      res,
      requestPasswordResetValidationRules
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

    const user = await User.findOne({ email });
    if (!user) {
      return sendErrorResponse({
        res: res,
        message: "Invalid credentials",
        errorCode: "INVALID_CREDENTIALS",
        errorDetails: "No user found with this email address",
        status: 400,
      });
    }

    const RESETPASSWORD_OPTIONS: OTPOptions = {
      length: config.otp.length,
      expiration: config.otp.expiration,
      template: "request_otp.html",
      maxAttempts: config.otp.maxAttempts,
      allowedResendInterval: config.otp.allowedResendInterval,
      subject: "Reset Password Code",
      user: user, // Pass the user object here
    };

    // send Code
    const otpResponse = await OTPService.sendOTP(RESETPASSWORD_OPTIONS);
    if (!otpResponse.success) {
      return sendErrorResponse({
        res: res,
        message: otpResponse.message,
        errorCode: "OTP_LIMIT",
        errorDetails: otpResponse.details,
        status: 429,
      });
    }

    return sendSuccessResponse({
      res: res,
      message: "Reset password Code sent to your email",
      status: 200,
    });
  } catch (err) {
    console.error("Password reset request error:", err);
    return sendErrorResponse({
      res: res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred during password reset request",
      status: 500,
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;
  try {
    // Validation
    const validationErrors = await validateRequest(
      req,
      res,
      resetPasswordValidationRules
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

    let messagesForUser: string[] = [];

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
      config.otp.maxAttempts,
      true
    );
    if (!otpRes.isValid) {
      return sendErrorResponse({
        res: res,
        message: otpRes.message,
        errorCode: otpRes.status,
        errorDetails: otpRes.details,
      });
    }

    // Set new password
    user.password = await bcrypt.hash(newPassword, config.bcrypt.rounds);
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();

    // Check if the account is activated and not deleted
    if (!user.isActivated) {
      return sendErrorResponse({
        res: res,
        message: "Account is disabled",
        errorCode: "ACCOUNT_DISABLED",
        errorDetails: "Please contact the support team",
        status: 403,
      });
    }

    // Check if the account is deleted and if it's been more than config.app.recoveryPeriod days
    const recoveryMessage = checkAccountRecoveryStatus(
      user,
      config.app.recoveryPeriod,
      res
    );
    if (recoveryMessage === "deleted") {
      return sendErrorResponse({
        res: res,
        message: "Account has been permanently deleted",
        errorCode: "ACCOUNT_DELETED",
        errorDetails:
          "The recovery period has ended. Your account is scheduled for permanent deletion.",
        status: 403,
      });
    }
    if (recoveryMessage) {
      messagesForUser.push(recoveryMessage);
    }

    // check is user email verified
    if (!user.emailVerified) {
      messagesForUser.push(`Please verify your email to use full features.`);
    }

    // Update last login
    user.authProvider = "local";
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT tokens
    const tokens = prepareMobileAuthResponse(user);

    // Prepare user data for response
    const userData = await formatUserData(user, messagesForUser);

    return sendSuccessResponse({
      res: res,
      message: "Password reset successful",
      data: {
        ...tokens,
        user: userData,
      },
      status: 200,
    });
  } catch (err) {
    console.error("Password reset error:", err);
    return sendErrorResponse({
      res: res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred during password reset, Please try again later.",
      status: 500,
    });
  }
};
