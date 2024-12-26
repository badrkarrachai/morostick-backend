import { Request, Response } from "express";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../../utils/response_handler_util";
import {
  prepareTokenRefreshResponse,
  verifyRefreshToken,
} from "../../utils/jwt_util";
import User from "../../models/users_model";

// This controller is responsible for refreshing the access token
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.header("X-Refresh-Token");

    if (!refreshToken) {
      return sendErrorResponse({
        res,
        message: "Refresh token is required",
        errorCode: "REFRESH_TOKEN_REQUIRED",
        errorDetails: "Please provide a valid refresh token to continue.",
        status: 401,
      });
    }

    // Verify the refresh token
    const decoded = await verifyRefreshToken(refreshToken);

    // Find and validate user
    const user = await User.findOne({
      _id: decoded.user.id,
      isActivated: true,
    });

    if (!user) {
      return sendErrorResponse({
        res,
        message: "Invalid refresh token",
        errorCode: "INVALID_REFRESH_TOKEN",
        errorDetails: "User not found or account is inactive.",
        status: 401,
      });
    }

    // Generate only new access token
    const { accessToken } = prepareTokenRefreshResponse(user);

    return sendSuccessResponse({
      res,
      message: "Access token refreshed successfully",
      data: {
        accessToken,
      },
    });
  } catch (error) {
    // Handle rate limiter errors
    if (error.name === "RateLimiterError") {
      return sendErrorResponse({
        res,
        message: "Too many refresh attempts",
        errorCode: "RATE_LIMIT_EXCEEDED",
        errorDetails: "Please wait before trying again.",
        status: 429,
      });
    }

    // Handle token verification errors
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return sendErrorResponse({
        res,
        message: "Invalid refresh token",
        errorCode: "INVALID_REFRESH_TOKEN",
        errorDetails: "Your session has expired. Please log in again.",
        status: 401,
      });
    }

    // Handle unexpected errors
    console.error("Refresh token error:", error);
    return sendErrorResponse({
      res,
      message: "Failed to refresh tokens",
      errorCode: "REFRESH_TOKEN_ERROR",
      errorDetails:
        "An unexpected error occurred. Please try logging in again.",
      status: 500,
    });
  }
};
