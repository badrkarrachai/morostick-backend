import { Request, Response } from "express";
import { Types } from "mongoose";
import { Sticker } from "../../../models/sticker_model";
import { StickerPack } from "../../../models/pack_model";
import { deleteFromStorage } from "../../../utils/storage_util";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { param } from "express-validator";
import { validateRequest } from "../../../utils/validations_util";

// Validation rules for single sticker deletion
export const deleteStickerValidationRules = [
  param("stickerId").isMongoId().withMessage("Invalid sticker ID"),
];

// Validation rules for bulk sticker deletion
export const bulkDeleteStickersValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
];

// Delete a single sticker
export const deleteSticker = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      deleteStickerValidationRules
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
          : "Invalid input data",
        status: 400,
      });
    }

    const { stickerId } = req.params;
    const userId = req.user.id;

    // Find sticker and verify it exists
    const sticker = await Sticker.findById(stickerId);
    if (!sticker) {
      return sendErrorResponse({
        res,
        message: "Sticker not found",
        errorCode: "STICKER_NOT_FOUND",
        errorDetails: "The requested sticker does not exist",
        status: 404,
      });
    }

    // Find associated pack and verify ownership
    const pack = await StickerPack.findById(sticker.packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Associated pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The associated sticker pack does not exist",
        status: 404,
      });
    }

    if (pack.creator._id.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You do not have permission to delete this sticker",
        status: 403,
      });
    }

    // Delete sticker files from storage
    const deletePromises = [
      deleteFromStorage(sticker.thumbnailUrl),
      deleteFromStorage(sticker.webpUrl),
    ];
    await Promise.all(deletePromises);

    // Remove sticker from pack
    await pack.removeSticker(sticker.id);

    // Delete sticker document
    await sticker.deleteOne();

    return sendSuccessResponse({
      res,
      message: "Sticker deleted successfully",
      status: 200,
    });
  } catch (error) {
    console.error("Delete sticker error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        error.message ||
        "An unexpected error occurred while deleting the sticker",
      status: 500,
    });
  }
};

// Bulk delete stickers
export const bulkDeleteStickers = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      bulkDeleteStickersValidationRules
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
          : "Invalid input data",
        status: 400,
      });
    }

    const { packId } = req.params;
    const { stickerIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(stickerIds) || stickerIds.length === 0) {
      return sendErrorResponse({
        res,
        message: "Invalid sticker IDs",
        errorCode: "INVALID_STICKER_IDS",
        errorDetails: "Please provide an array of sticker IDs to delete",
        status: 400,
      });
    }

    // Verify all stickerIds are valid ObjectIds
    const validIds = stickerIds.every((id) => Types.ObjectId.isValid(id));
    if (!validIds) {
      return sendErrorResponse({
        res,
        message: "Invalid sticker IDs",
        errorCode: "INVALID_STICKER_IDS",
        errorDetails: "One or more sticker IDs are invalid",
        status: 400,
      });
    }

    // Find pack and verify ownership
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested sticker pack does not exist",
        status: 404,
      });
    }

    if (pack.creator._id.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails:
          "You do not have permission to delete stickers from this pack",
        status: 403,
      });
    }

    // Find all stickers to be deleted
    const stickers = await Sticker.find({
      _id: { $in: stickerIds },
      packId: packId,
    });

    // Delete files from storage
    const deletePromises = stickers.flatMap((sticker) => [
      deleteFromStorage(sticker.thumbnailUrl),
      deleteFromStorage(sticker.webpUrl),
    ]);
    await Promise.all(deletePromises);

    // Remove stickers from pack
    for (const sticker of stickers) {
      await pack.removeSticker(sticker.id);
    }

    // Delete sticker documents
    await Sticker.deleteMany({
      _id: { $in: stickerIds },
      packId: packId,
    });

    return sendSuccessResponse({
      res,
      message: "Stickers deleted successfully",
      data: {
        deletedCount: stickers.length,
      },
      status: 200,
    });
  } catch (error) {
    console.error("Bulk delete stickers error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        error.message ||
        "An unexpected error occurred while deleting the stickers",
      status: 500,
    });
  }
};
