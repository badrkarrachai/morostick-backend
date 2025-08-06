import { Request, Response } from "express";
import { StickerPack } from "../../models/pack_model";
import { Sticker } from "../../models/sticker_model"; // Assuming you have a Sticker model
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { param, query } from "express-validator";
import { deleteFromStorage } from "../../utils/storage_util";
import User from "../../models/users_model";

// Helper function for deleting sticker files
async function deleteStickerFiles(sticker: any) {
  try {
    // Delete all associated files
    const deletePromises = [deleteFromStorage(sticker.imageUrl), deleteFromStorage(sticker.thumbnailUrl), deleteFromStorage(sticker.webpUrl)];

    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error(`Error deleting files for sticker: ${sticker._id}`, error);
    return false;
  }
}

export const deletePack = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { packId } = req.query;

  try {
    // Validate request
    const validationErrors = await validateRequest(req, res, deletePackValidationRules);
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

    // Find pack and populate stickers
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

    // Check ownership
    if (pack.creator.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You do not have permission to delete this pack.",
        status: 403,
      });
    }

    // Get all stickers for this pack
    const stickers = await Sticker.find({ packId: pack._id });

    // Delete all sticker files
    const deletionResults = await Promise.allSettled(
      stickers.map(async (sticker) => {
        // Delete sticker files from storage
        await deleteStickerFiles(sticker);
        // Delete sticker document
        await Sticker.findByIdAndDelete(sticker._id);
      })
    );

    // Check for any failures in sticker deletion
    const failedDeletions = deletionResults.filter((result) => result.status === "rejected");
    if (failedDeletions.length > 0) {
      console.error(`Failed to delete ${failedDeletions.length} stickers for pack ${packId}`, failedDeletions);
    }

    // Delete the pack
    await pack.deleteOne();

    // Remove pack from user
    await User.findByIdAndUpdate(userId, {
      $pull: {
        packs: packId,
      },
    });

    // If some files failed to delete but the pack was deleted
    if (failedDeletions.length > 0) {
      return sendSuccessResponse({
        res,
        message: "Pack deleted successfully",
        status: 200,
      });
    }

    return sendSuccessResponse({
      res,
      message: "Pack and all associated stickers deleted successfully",
      status: 200,
    });
  } catch (err) {
    console.error("Pack deletion error:", err);

    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while deleting the pack and its stickers.",
      status: 500,
    });
  }
};

// Validation rules
export const deletePackValidationRules = [query("packId").optional().isMongoId().withMessage("Invalid pack ID format")];
