import { Request, Response } from "express";
import { query } from "express-validator";
import { Types } from "mongoose";
import { Sticker } from "../../models/sticker_model";
import User from "../../models/users_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformSticker } from "../../utils/responces_templates/response_views_transformer";

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

    // Find the sticker and populate its pack to check privacy
    const sticker = await Sticker.findById(stickerId).populate({
      path: "packId",
      select: "isPrivate isAuthorized",
    });

    if (!sticker || !sticker.packId || (sticker.packId as any).isPrivate || !(sticker.packId as any).isAuthorized) {
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
      // Add to favorites
      user.favoritesStickers.push(stickerObjectId);
      await user.save();

      // Increment sticker's favorites count
      await sticker.incrementStats("favorites");

      // Transform sticker for response
      const stickerView = await transformSticker(sticker);

      return sendSuccessResponse({
        res,
        message: "Sticker added to favorites successfully",
        data: {
          isFavorite: true,
          favoritesCount: sticker.stats.favorites,
          sticker: stickerView,
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
