import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import { Sticker } from "../../../models/sticker_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { body, param } from "express-validator";
import { Types } from "mongoose";
import { processObject } from "../../../utils/process_object";
import { packKeysToRemove } from "../../../interfaces/pack_interface";
import { transformPack } from "../../../utils/responces_templates/response_views_transformer";

export const reorderStickersValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("stickerIds")
    .isArray({ min: 1 })
    .withMessage("Sticker IDs must be a non-empty array"),
  body("stickerIds.*").isMongoId().withMessage("Invalid sticker ID format"),
];

export const moveStickerValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("stickerId").isMongoId().withMessage("Invalid sticker ID"),
  body("newPosition")
    .isInt({ min: 0 })
    .withMessage("New position must be a non-negative integer"),
];

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
        errorDetails: Array.isArray(validationErrors)
          ? validationErrors.join(", ")
          : validationErrors,
        status: 400,
      });
    }

    // Find pack with stickers populated
    const pack = await StickerPack.findById(packId).populate({
      path: "stickers",
      select: "_id creator packId",
    });

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist.",
        status: 404,
      });
    }

    // Validate user is pack creator
    const isPackCreator = await StickerPack.exists({
      _id: packId,
      creator: userId,
    });

    if (!isPackCreator) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails:
          "You do not have permission to reorder stickers in this pack.",
        status: 403,
      });
    }

    // Validate sticker count matches
    if (stickerIds.length !== pack.stickers.length) {
      return sendErrorResponse({
        res,
        message: "Invalid sticker count",
        errorCode: "INVALID_STICKER_COUNT",
        errorDetails:
          "The number of stickers provided does not match the pack.",
        status: 400,
      });
    }

    // Validate all stickers exist and belong to this pack
    const stickers = await Sticker.find({
      _id: { $in: stickerIds },
      packId: packId,
    }).lean();

    if (stickers.length !== stickerIds.length) {
      return sendErrorResponse({
        res,
        message: "Invalid stickers",
        errorCode: "INVALID_STICKERS",
        errorDetails:
          "One or more stickers do not exist or do not belong to this pack.",
        status: 400,
      });
    }

    // Convert string IDs to ObjectIds
    const stickerObjectIds = stickerIds.map((id) => new Types.ObjectId(id));

    // Update sticker positions
    await Promise.all(
      stickerObjectIds.map((stickerId, index) =>
        Sticker.findByIdAndUpdate(stickerId, { position: index })
      )
    );

    // Update pack stickers order
    const updatedPack = await StickerPack.findByIdAndUpdate(
      packId,
      { $set: { stickers: stickerObjectIds } },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPack) {
      return sendErrorResponse({
        res,
        message: "Update failed",
        errorCode: "UPDATE_FAILED",
        errorDetails: "Failed to update sticker order.",
        status: 500,
      });
    }

    const packView = await transformPack(updatedPack);

    return sendSuccessResponse({
      res,
      message: "Stickers reordered successfully",
      data: packView,
    });
  } catch (err) {
    console.error("Sticker reorder error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while reordering stickers.",
      status: 500,
    });
  }
};

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
        errorDetails: validationErrors,
        status: 400,
      });
    }

    // Find pack with stickers
    const pack = await StickerPack.findById(packId);

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist.",
        status: 404,
      });
    }

    // Validate user is pack creator using pack
    const isPackCreator = pack.creator.toString() === userId;

    if (!isPackCreator) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails:
          "You do not have permission to move stickers in this pack.",
        status: 403,
      });
    }

    // Validate sticker exists and belongs to pack
    const sticker = await Sticker.findOne({
      _id: stickerId,
      packId: packId,
    });

    if (!sticker) {
      return sendErrorResponse({
        res,
        message: "Invalid sticker",
        errorCode: "INVALID_STICKER",
        errorDetails: "Sticker does not exist or does not belong to this pack.",
        status: 400,
      });
    }

    // Validate new position
    if (newPosition >= pack.stickers.length) {
      return sendErrorResponse({
        res,
        message: "Invalid position",
        errorCode: "INVALID_POSITION",
        errorDetails: "The new position exceeds the pack's sticker count.",
        status: 400,
      });
    }

    const currentPosition = sticker.position;

    // Update positions for affected stickers
    if (newPosition > currentPosition) {
      await Sticker.updateMany(
        {
          packId,
          position: { $gt: currentPosition, $lte: newPosition },
        },
        { $inc: { position: -1 } }
      );
    } else if (newPosition < currentPosition) {
      await Sticker.updateMany(
        {
          packId,
          position: { $gte: newPosition, $lt: currentPosition },
        },
        { $inc: { position: 1 } }
      );
    }

    // Update moved sticker position
    sticker.position = newPosition;
    await sticker.save();

    const packView = await transformPack(pack);

    return sendSuccessResponse({
      res,
      message: "Sticker moved successfully",
      data: packView,
    });
  } catch (err) {
    console.error("Sticker move error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while moving the sticker.",
      status: 500,
    });
  }
};
