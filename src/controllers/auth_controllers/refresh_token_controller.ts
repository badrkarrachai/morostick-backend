import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import config from "../../config";
import { JwtPayload } from "../../interfaces/jwt_payload_interface";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../../utils/response_handler_util";
import { generateAccessToken } from "../../utils/jwt_util";
import User from "../../models/users_model";

// This controller is responsible for refreshing the access token
export const refreshToken = async (req: Request, res: Response) => {
  const refreshToken =
    req.cookies.refreshToken ||
    req.body.refreshToken ||
    req.headers["x-refresh-token"];

  if (!refreshToken) {
    return sendErrorResponse({
      res: res,
      message: "Refresh token not found",
      errorCode: "UNAUTHORIZED",
      errorDetails: "No refresh token provided in the request",
      status: 401,
    });
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      config.jwtSecret.refreshTokenSecret
    ) as JwtPayload;

    const user = await User.findById(decoded.user.id);
    if (!user) {
      return sendErrorResponse({
        res: res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The user associated with this token no longer exists.",
        status: 404,
      });
    }

    // Generate new tokens
    const accessToken = generateAccessToken(user.id, user.role);

    // Send the new access token to the client
    return sendSuccessResponse({
      res: res,
      message: "Access token refreshed",
      data: { accessToken },
      status: 200,
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return sendErrorResponse({
        res: res,
        message: "Refresh token expired",
        errorCode: "TOKEN_EXPIRED",
        errorDetails: "The refresh token has expired. Please login again.",
        status: 401,
      });
    } else if (err instanceof jwt.JsonWebTokenError) {
      return sendErrorResponse({
        res: res,
        message: "Invalid refresh token",
        errorCode: "INVALID_TOKEN",
        errorDetails: "The provided refresh token is not valid.",
        status: 401,
      });
    }
    console.error("Refresh token error:", err);
    return sendErrorResponse({
      res: res,
      message: "Server error",
      errorCode: "INTERNAL_SERVER_ERROR",
      errorDetails: "An unexpected error occurred while refreshing the token.",
      status: 500,
    });
  }
};
