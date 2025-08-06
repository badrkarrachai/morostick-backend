import { Request, Response } from "express";
import { query } from "express-validator";
import { Types } from "mongoose";
import { StickerPack } from "../../models/pack_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformPack } from "../../utils/responces_templates/response_views_transformer";

// Validation rules
export const togglePackPrivacyValidationRules = [
  query("packId").exists().withMessage("Pack ID is required").isMongoId().withMessage("Invalid pack ID format"),
];

export const togglePackPrivacy = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { packId } = req.query;

    // Validate request
    const validationErrors = await validateRequest(req, res, togglePackPrivacyValidationRules);
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

    // Find the pack and verify ownership
    const pack = await StickerPack.findOne({
      _id: new Types.ObjectId(packId as string),
      creator: new Types.ObjectId(userId),
    });

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist or you don't have permission to modify it",
        status: 404,
      });
    }

    // Toggle the privacy status
    const newPrivacyStatus = !pack.isPrivate;
    pack.isPrivate = newPrivacyStatus;
    await pack.save();

    // Transform pack for response
    const transformedPack = await transformPack(pack, {
      includeStickers: true,
      includeTotalCount: true,
      stickersLimit: 10,
    });

    return sendSuccessResponse({
      res,
      message: `Pack privacy ${newPrivacyStatus ? "enabled" : "disabled"} successfully`,
      data: {
        pack: transformedPack,
        isPrivate: newPrivacyStatus,
        message: newPrivacyStatus ? "Pack is now private and only visible to you" : "Pack is now public and visible to everyone",
      },
    });
  } catch (err) {
    console.error("Toggle pack privacy error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while updating pack privacy",
      status: 500,
    });
  }
};
