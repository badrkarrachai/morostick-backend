import { Request, Response } from "express";
import { query } from "express-validator";
import { Types } from "mongoose";
import { StickerPack } from "../../models/pack_model";
import User from "../../models/users_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformPack } from "../../utils/responces_templates/response_views_transformer";

// Validation rules
export const addPackToFavoritesValidationRules = [
  query("packId").exists().withMessage("Pack ID is required").isMongoId().withMessage("Invalid pack ID format"),
];

export const addPackToFavorites = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { packId } = req.query;

    // Validate request
    const validationErrors = await validateRequest(req, res, addPackToFavoritesValidationRules);

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

    // Find the pack and check ownership
    const pack = await StickerPack.findById(packId).populate("creator", "_id");

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist",
        status: 404,
      });
    }

    // Check if user owns the pack
    const isUserOwner = pack.creator && pack.creator._id.toString() === userId;

    // Allow access if pack is public+authorized OR if user owns the pack
    if (!isUserOwner && (pack.isPrivate || !pack.isAuthorized)) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist or is not accessible",
        status: 404,
      });
    }

    // Find the user and check if pack is already in favorites
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "User account not found",
        status: 404,
      });
    }

    const packObjectId = new Types.ObjectId(packId as string);
    const isAlreadyFavorite = user.favoritesPacks.some((id) => id.equals(packObjectId));

    // Toggle favorite status
    if (isAlreadyFavorite) {
      // Remove from favorites
      user.favoritesPacks = user.favoritesPacks.filter((id) => !id.equals(packObjectId));
      await user.save();

      // Decrement pack's favorites count
      await pack.decrementStats("favorites");

      return sendSuccessResponse({
        res,
        message: "Pack removed from favorites successfully",
        data: {
          isFavorite: false,
          favoritesCount: pack.stats.favorites !== 0 ? pack.stats.favorites - 1 : 0,
        },
      });
    } else {
      // Add to favorites
      user.favoritesPacks.push(packObjectId);
      await user.save();

      // Increment pack's favorites count
      await pack.incrementStats("favorites");

      // Transform pack for response
      const packView = await transformPack(pack, {
        includeStickers: true,
        includeTotalCount: true,
        stickersLimit: 30,
      });

      return sendSuccessResponse({
        res,
        message: "Pack added to favorites successfully",
        data: {
          isFavorite: true,
          favoritesCount: packView.stats.favorites,
          pack: packView,
        },
      });
    }
  } catch (err) {
    console.error("Add pack to favorites error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while processing the request",
      status: 500,
    });
  }
};
