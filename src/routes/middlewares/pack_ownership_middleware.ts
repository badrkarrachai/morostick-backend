import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import StickerPack from "../../models/pack_model";
import { sendErrorResponse } from "../../utils/response_handler_util";

export const validatePackOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { packId } = req.params;
    const userId = req.user.id; // Assuming req.user is set by auth middleware

    if (!Types.ObjectId.isValid(packId)) {
      return sendErrorResponse({
        res,
        message: "Invalid pack ID",
        errorCode: "INVALID_PACK_ID",
        errorDetails: "The provided pack ID is not valid.",
        status: 400,
      });
    }

    const pack = await StickerPack.findById(packId);

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The specified sticker pack does not exist.",
        status: 404,
      });
    }

    if (!pack.creator.userId.equals(userId)) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "NOT_PACK_OWNER",
        errorDetails: "You don't have permission to modify this pack.",
        status: 403,
      });
    }

    // Add pack to request for use in controller
    req.pack = pack;
    next();
  } catch (error) {
    console.error("Pack ownership validation error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "Error validating pack ownership",
      status: 500,
    });
  }
};
