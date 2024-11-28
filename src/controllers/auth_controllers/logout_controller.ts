import { Request, Response } from "express";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import User from "../../models/users_model"; // Adjust the import path as needed

export const logout = async (req: Request, res: Response) => {
  try {
    // Get the user ID from the authenticated request
    const userId = req.user?.id;

    if (!userId) {
      return sendErrorResponse({
        res,
        message: "User not authenticated",
        errorCode: "UNAUTHENTICATED",
        errorDetails: "No authenticated user found for this session.",
        status: 401,
      });
    }

    // Find the user and update their refreshToken field (if you're storing it)
    await User.findByIdAndUpdate(userId, { refreshToken: null });

    // Clear the refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    // Send a success response
    sendSuccessResponse({
      res,
      message: "Logged out successfully",
      data: null,
      status: 200,
    });
  } catch (error) {
    console.error("Logout error:", error);
    sendErrorResponse({
      res,
      message: "An error occurred during logout",
      errorCode: "LOGOUT_ERROR",
      errorDetails: error.message,
      status: 500,
    });
  }
};
