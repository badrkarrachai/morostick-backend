import { Request, Response } from "express";
import { query } from "express-validator";
import { Types } from "mongoose";
import { Sticker } from "../../models/sticker_model";
import User from "../../models/users_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformSticker } from "../../utils/responces_templates/response_views_transformer";

const MAX_FAVORITE_STICKERS_PER_TYPE = 30;

export const addStickerToFavoritesValidationRules = [
  query("stickerId").exists().withMessage("Sticker ID is required").isMongoId().withMessage("Invalid sticker ID format"),
];

export const addStickerToFavorites = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { stickerId } = req.query;

    // Validate request
    const validationErrors = await validateRequest(req, res, addStickerToFavoritesValidationRules);

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

    // Find the sticker and populate its pack to check privacy and ownership
    const sticker = await Sticker.findById(stickerId).populate({
      path: "packId",
      select: "isPrivate isAuthorized creator",
    });

    if (!sticker || !sticker.packId) {
      return sendErrorResponse({
        res,
        message: "Sticker not found",
        errorCode: "STICKER_NOT_FOUND",
        errorDetails: "The requested sticker does not exist",
        status: 404,
      });
    }

    const pack = sticker.packId as any;
    const isUserOwner = pack.creator && pack.creator.toString() === userId;

    // Allow access if pack is public and authorized, OR if user owns the pack
    if (!isUserOwner && (pack.isPrivate || !pack.isAuthorized)) {
      return sendErrorResponse({
        res,
        message: "Sticker not found",
        errorCode: "STICKER_NOT_FOUND",
        errorDetails: "The requested sticker does not exist or is not accessible",
        status: 404,
      });
    }

    // Find the user and check if sticker is already in favorites
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

    const stickerObjectId = new Types.ObjectId(stickerId as string);
    const isAlreadyFavorite = user.favoritesStickers.some((id) => id.equals(stickerObjectId));

    // Toggle favorite status
    if (isAlreadyFavorite) {
      // Remove from favorites
      user.favoritesStickers = user.favoritesStickers.filter((id) => !id.equals(stickerObjectId));
      await user.save();

      // Decrement sticker's favorites count
      await sticker.decrementStats("favorites");

      return sendSuccessResponse({
        res,
        message: "Sticker removed from favorites successfully",
        data: {
          isFavorite: false,
          favoritesCount: sticker.stats.favorites,
        },
      });
    } else {
      // Check if user has reached the maximum favorites limit for this sticker type
      // Get current stickers by type to check per-type limits
      const allCurrentStickers = await Sticker.find({
        _id: { $in: user.favoritesStickers },
      }).select("isAnimated");

      const currentStickersByType = allCurrentStickers.filter((s) => s.isAnimated === sticker.isAnimated);

      if (currentStickersByType.length >= MAX_FAVORITE_STICKERS_PER_TYPE) {
        // Find the oldest sticker ID of the same type to remove
        let oldestStickerIdToRemove = null;

        // Go through user's favorites in order (oldest first) to find first sticker of same type
        for (const favoriteId of user.favoritesStickers) {
          const candidateSticker = allCurrentStickers.find((s) => (s._id as any).equals(favoriteId));
          if (candidateSticker && candidateSticker.isAnimated === sticker.isAnimated) {
            oldestStickerIdToRemove = favoriteId;
            break;
          }
        }

        if (oldestStickerIdToRemove) {
          // Remove the oldest sticker of the same type from user's favorites
          user.favoritesStickers = user.favoritesStickers.filter((id) => !id.equals(oldestStickerIdToRemove));

          // Fetch the full sticker document and decrement favorites count
          const oldestSticker = await Sticker.findById(oldestStickerIdToRemove);
          if (oldestSticker) {
            await oldestSticker.decrementStats("favorites");
          }
        }
      }

      // Add new sticker to favorites (at the end of the array)
      user.favoritesStickers.push(stickerObjectId);
      await user.save();

      // Increment sticker's favorites count
      await sticker.incrementStats("favorites");

      // Transform sticker for response
      const stickerView = await transformSticker(sticker);

      // Check if we removed an old sticker (compare against updated count for this type)
      const updatedStickersByType = await Sticker.find({
        _id: { $in: user.favoritesStickers },
        isAnimated: sticker.isAnimated,
      });
      const removedOldSticker = updatedStickersByType.length === MAX_FAVORITE_STICKERS_PER_TYPE;

      return sendSuccessResponse({
        res,
        message: removedOldSticker
          ? "Oldest favorite sticker was removed to add new sticker to favorites"
          : "Sticker added to favorites successfully",
        data: {
          isFavorite: true,
          favoritesCount: sticker.stats.favorites,
          sticker: stickerView,
          reachedLimit: removedOldSticker,
          currentFavoriteCount: user.favoritesStickers.length,
          maxFavorites: MAX_FAVORITE_STICKERS_PER_TYPE,
        },
      });
    }
  } catch (err) {
    console.error("Add sticker to favorites error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while processing the request",
      status: 500,
    });
  }
};
