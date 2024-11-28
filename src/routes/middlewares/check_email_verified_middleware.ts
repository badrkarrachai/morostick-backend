import { NextFunction } from "express";
import { Request, Response } from "express";
import User from "../../models/users_model";
import { sendErrorResponse } from "../../utils/response_handler_util";

export const checkEmailVerified = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id; // Assuming you have the user ID in the request after authentication
    const user = await User.findById(userId);

    if (!user) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "User authentication is required for this action.",
        status: 401,
      });
    }

    if (!user.emailVerified) {
      return sendErrorResponse({
        res,
        message: "Email not verified",
        errorCode: "EMAIL_NOT_VERIFIED",
        errorDetails:
          "Your email is not verified. Please verify your email before proceeding.",
        status: 403,
      });
    }

    next();
  } catch (error) {
    console.error("Error in checkEmailVerified middleware:", error);
    sendErrorResponse({
      res,
      message: "An error occurred",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while checking email verification.",
      status: 500,
    });
  }
};
