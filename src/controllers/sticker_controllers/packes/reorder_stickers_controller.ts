import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { body, param } from "express-validator";
import { Types } from "mongoose";
import { PackPreviewFormatter } from "../../../utils/responces_templates/pack_response_template";
import { IPackPreview } from "../../../interfaces/pack_interface";

// Validation for reordering multiple stickers
export const reorderStickersValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("stickerIds")
    .isArray()
    .withMessage("Sticker IDs must be an array")
    .custom((value) => {
      return value.every((id: string) => Types.ObjectId.isValid(id));
    })
    .withMessage("Invalid sticker ID format"),
];

// Validation for moving a single sticker
export const moveStickerValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("stickerId").isMongoId().withMessage("Invalid sticker ID"),
  body("newPosition")
    .isInt({ min: 0 })
    .withMessage("New position must be a non-negative integer"),
];

// Reorder multiple stickers
export const reorderStickers = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { packId } = req.params;
  const { stickerIds } = req.body;

  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      reorderStickersValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: "Invalid input parameters",
        status: 400,
      });
    }

    // Find pack
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist",
        status: 404,
      });
    }

    // Check ownership
    if (pack.creator._id.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You do not have permission to modify this pack",
        status: 403,
      });
    }

    // Reorder stickers
    try {
      await pack.reorderStickers(
        stickerIds.map((id: string) => new Types.ObjectId(id))
      );
    } catch (error) {
      return sendErrorResponse({
        res,
        message: "Reorder failed",
        errorCode: "REORDER_FAILED",
        errorDetails: error.message,
        status: 400,
      });
    }

    // Reload pack with updated sticker order
    const updatedPack = await StickerPack.findById(packId).populate("stickers");

    return sendSuccessResponse<IPackPreview>({
      res,
      message: "Stickers reordered successfully",
      data: PackPreviewFormatter.toPackPreview(updatedPack),
    });
  } catch (error) {
    console.error("Sticker reorder error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while reordering stickers",
      status: 500,
    });
  }
};

// Move single sticker
export const moveSticker = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { packId } = req.params;
  const { stickerId, newPosition } = req.body;

  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      moveStickerValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: "Invalid input parameters",
        status: 400,
      });
    }

    // Find pack
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist",
        status: 404,
      });
    }

    // Check ownership
    if (pack.creator._id.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You do not have permission to modify this pack",
        status: 403,
      });
    }

    // Move sticker
    try {
      await pack.moveSticker(new Types.ObjectId(stickerId), newPosition);
    } catch (error) {
      return sendErrorResponse({
        res,
        message: "Move failed",
        errorCode: "MOVE_FAILED",
        errorDetails: error.message,
        status: 400,
      });
    }

    // Reload pack with updated sticker order
    const updatedPack = await StickerPack.findById(packId).populate("stickers");

    return sendSuccessResponse<IPackPreview>({
      res,
      message: "Sticker moved successfully",
      data: PackPreviewFormatter.toPackPreview(updatedPack),
    });
  } catch (error) {
    console.error("Sticker move error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while moving the sticker",
      status: 500,
    });
  }
};

export default {
  reorderStickers,
  moveSticker,
};
