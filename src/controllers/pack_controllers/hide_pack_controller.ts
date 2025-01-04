import { Request, Response } from "express";
import { StickerPack } from "../../models/pack_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { query } from "express-validator";
import { Types } from "mongoose";
import User from "../../models/users_model";

export const hidePackValidationRules = [query("packId").isMongoId().withMessage("Invalid pack ID")];

export const hidePack = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { packId } = req.query;

    // Validate request
    const validationErrors = await validateRequest(req, res, hidePackValidationRules);
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors) ? validationErrors : undefined,
        errorDetails: Array.isArray(validationErrors) ? validationErrors.join(", ") : validationErrors,
        status: 400,
      });
    }

    // Check if pack exists
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The specified pack does not exist",
        status: 404,
      });
    }

    // Check if pack is already hidden
    const user = await User.findById(userId);
    const isPackHidden = user.hiddenPacks.some((hiddenPackId) => hiddenPackId.toString() === packId);

    if (isPackHidden) {
      return sendErrorResponse({
        res,
        message: "Pack already hidden",
        errorCode: "PACK_ALREADY_HIDDEN",
        errorDetails: "This pack is already in your hidden packs list",
        status: 409,
      });
    }

    // Add pack to hidden packs
    await User.findByIdAndUpdate(
      userId,
      {
        $addToSet: { hiddenPacks: new Types.ObjectId(packId as string) },
      },
      { new: true }
    );

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Pack hidden successfully",
      data: {
        packId,
        hidden: true,
      },
    });
  } catch (err) {
    console.error("Hide pack error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while hiding the pack",
      status: 500,
    });
  }
};

// Controller to unhide a pack
export const unhidePackValidationRules = [query("packId").isMongoId().withMessage("Invalid pack ID")];

export const unhidePack = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { packId } = req.query;

    // Validate request
    const validationErrors = await validateRequest(req, res, unhidePackValidationRules);
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors) ? validationErrors : undefined,
        errorDetails: Array.isArray(validationErrors) ? validationErrors.join(", ") : validationErrors,
        status: 400,
      });
    }

    // Check if pack exists
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The specified pack does not exist",
        status: 404,
      });
    }

    // Remove pack from hidden packs
    const result = await User.findByIdAndUpdate(
      userId,
      {
        $pull: { hiddenPacks: new Types.ObjectId(packId as string) },
      },
      { new: true }
    );

    // Check if pack was actually unhidden
    if (!result) {
      return sendErrorResponse({
        res,
        message: "Pack not hidden",
        errorCode: "PACK_NOT_HIDDEN",
        errorDetails: "This pack is not in your hidden packs list",
        status: 404,
      });
    }

    return sendSuccessResponse({
      res,
      status: 200,
      message: "Pack unhidden successfully",
      data: {
        packId,
        hidden: false,
      },
    });
  } catch (err) {
    console.error("Unhide pack error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while unhiding the pack",
      status: 500,
    });
  }
};
