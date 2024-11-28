import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, verifyRefreshToken } from "../../utils/jwt_util";
import { JwtPayload } from "../../interfaces/jwt_payload_interface";
import { sendErrorResponse } from "../../utils/response_handler_util";
import User from "../../models/users_model";
import config from "../../config";

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return sendErrorResponse({
      res: res,
      message: "Please log in to access this feature",
      errorCode: "LOGIN_REQUIRED",
      errorDetails:
        "Your session may have expired. Please log in again to continue.",
      status: 401,
    });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded.user;

    const user = await User.findById(req.user.id);
    if (!user) {
      return sendErrorResponse({
        res: res,
        message: "Account not found",
        errorCode: "ACCOUNT_NOT_FOUND",
        errorDetails:
          "We couldn't find your account. Please contact support if you believe this is an error.",
        status: 404,
      });
    }

    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return sendErrorResponse({
        res: res,
        message: "Session expired",
        errorCode: "SESSION_EXPIRED",
        errorDetails:
          "Your session has expired. Please log in again to continue.",
        status: 401,
      });
    }

    try {
      verifyRefreshToken(refreshToken);
    } catch (err) {
      return sendErrorResponse({
        res: res,
        message: "Session invalid",
        errorCode: "INVALID_SESSION",
        errorDetails:
          "Your session is no longer valid. Please log in again for security reasons.",
        status: 401,
      });
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return sendErrorResponse({
        res: res,
        message: "Session timed out",
        errorCode: "SESSION_TIMEOUT",
        errorDetails:
          "Your session has timed out for security reasons. Please log in again to continue.",
        status: 401,
      });
    } else if (err.name === "JsonWebTokenError") {
      return sendErrorResponse({
        res: res,
        message: "Authentication failed",
        errorCode: "AUTH_FAILED",
        errorDetails:
          "We couldn't verify your identity. Please try logging in again.",
        status: 401,
      });
    }
    console.error("Auth middleware error:", err);
    return sendErrorResponse({
      res: res,
      message: "Oops! Something went wrong",
      errorCode: "UNEXPECTED_ERROR",
      errorDetails:
        "We encountered an unexpected error. Please try again later or contact support if the problem persists.",
      status: 500,
    });
  }
};
