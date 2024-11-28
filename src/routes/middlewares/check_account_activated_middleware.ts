import { NextFunction } from "express";
import { Request, Response } from "express";
import User from "../../models/users_model";
import { sendErrorResponse } from "../../utils/response_handler_util";

export const checkAccountActivated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
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

    if (!user.isActivated) {
      return sendErrorResponse({
        res,
        message: "Account is not activated",
        errorCode: "ACCOUNT_NOT_ACTIVATED",
        errorDetails:
          "Your account is disabled. Please contact the administrator for further assistance.",
        status: 403,
      });
    }

    next();
  } catch (error) {
    console.error("Error in checkAccountActivated middleware:", error);
    sendErrorResponse({
      res,
      message: "An error occurred",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while checking account activation.",
      status: 500,
    });
  }
};
