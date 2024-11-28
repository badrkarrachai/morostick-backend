import { Request, Response } from "express";
import User from "../../../models/users_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";

// Recover deleted user
export const recoverUser = async (req: Request, res: Response) => {
  if (!req.user) {
    return sendErrorResponse({
      res: res,
      message: "Unauthorized",
      errorCode: "UNAUTHORIZED",
      errorDetails: "User authentication is required for this action",
      status: 401,
    });
  }

  const userId = req.user.id;

  try {
    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res: res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The requested user could not be found",
        status: 404,
      });
    }

    // Check if the user is deleted
    if (!user.isDeleted) {
      return sendErrorResponse({
        res: res,
        message: "User account is not deleted",
        errorCode: "ACCOUNT_NOT_DELETED",
        errorDetails: "This user account is not in a deleted state",
        status: 403,
      });
    }

    // Check if the deletion was within the last 15 days
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    if (!user.deletedAt || user.deletedAt < fifteenDaysAgo) {
      return sendErrorResponse({
        res: res,
        message: "Account recovery period has expired",
        errorCode: "RECOVERY_PERIOD_EXPIRED",
        errorDetails:
          "The 15-day account recovery period has expired. You can't recover your account.",
      });
    }

    // Recover the user account
    user.isDeleted = false;
    user.deletedAt = undefined;
    await user.save();

    // Send response
    return sendSuccessResponse({
      res: res,
      message: "User account recovered successfully",
      data: {
        userId: user.id,
        recoveredAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Recover user error:", err);
    return sendErrorResponse({
      res: res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while recovering the user account, Please try again later.",
      status: 500,
    });
  }
};
