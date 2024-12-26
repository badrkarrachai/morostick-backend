import { Request, Response } from "express";
import User from "../../models/users_model";
import {
  generateAccessToken,
  generateRefreshToken,
  prepareMobileAuthResponse,
} from "../../utils/jwt_util";
import sanitize from "mongo-sanitize";
import bcrypt from "bcrypt";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import {
  loginValidationRules,
  validateRequest,
} from "../../utils/validations_util";
import config from "../../config";
import { checkAccountRecoveryStatus } from "../../utils/account_deletion_check_util";
import { formatUserData } from "../../utils/responces_templates/user_auth_response_template";

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Validation
  const validationErrors = await validateRequest(
    req,
    res,
    loginValidationRules
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

  // Sanitize input to prevent NoSQL injection
  const sanitizedEmail = sanitize(email);

  try {
    let messagesForUser: string[] = [];

    // Find the user by sanitized email
    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return sendErrorResponse({
        res: res,
        message: "Invalid credentials",
        errorCode: "INVALID_CREDENTIALS",
        errorFields: ["email"],
        errorDetails:
          "There is no account associated with this email, try creating an account.",
      });
    }

    // Check if the account is activated
    if (!user.isActivated) {
      return sendErrorResponse({
        res: res,
        message: "Your account is disabled",
        errorCode: "ACCOUNT_DISABLED",
        errorFields: ["email", "password"],
        errorDetails:
          "Account is not activated, please contact the support team.",
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
        errorFields: ["email", "password"],
        errorCode: "ACCOUNT_DELETED",
        errorDetails:
          "The recovery period has ended. Your account is scheduled for permanent deletion.",
        status: 403,
      });
    }
    if (recoveryMessage) {
      messagesForUser.push(recoveryMessage);
    }

    // Check password
    const isMatch = await bcrypt.compare(
      password as string,
      user.password as string
    );
    if (!isMatch) {
      return sendErrorResponse({
        res: res,
        message: "Invalid credentials",
        errorCode: "INVALID_CREDENTIALS",
        errorFields: ["password"],
        errorDetails:
          "Password is incorrect, please try again with a different password.",
      });
    }

    // check is user email verified
    if (!user.emailVerified) {
      messagesForUser.push(`Please verify your email to use full features.`);
    }

    // Update last login timestamp and auth provider
    user.authProvider = "local";
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT tokens
    const tokens = prepareMobileAuthResponse(user);

    // Prepare user data for response
    const userData = await formatUserData(user, messagesForUser);

    // Send response
    return sendSuccessResponse({
      res: res,
      message: "Login successful",
      data: {
        ...tokens,
        user: userData,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return sendErrorResponse({
      res: res,
      message: "Server error",
      errorCode: "INTERNAL_SERVER_ERROR",
      errorDetails: "An unexpected error occurred, Please try again later.",
      status: 500,
    });
  }
};
