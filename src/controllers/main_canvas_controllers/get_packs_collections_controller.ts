import { Request, Response } from "express";
import { StickerPack } from "../../models/pack_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { transformPack } from "../../utils/responces_templates/response_views_transformer";
import { extractToken } from "../../routes/middlewares/auth_middleware";
import { verifyAccessToken } from "../../utils/jwt_util";
import User from "../../models/users_model";
import { Types } from "mongoose";

// No interface needed - we'll return the transformed packs directly

// Hardcoded list of pack IDs to return
const HARDCODED_PACK_IDS = [
  "676d7bbd3e39d8d4cc9cd76f",
  "676d808d86038fb0ee94e572",
  "676d82fc86038fb0ee94e7dd",
  "676d893386038fb0ee94ecab",
  "676d8d1f86038fb0ee94f3f7",
  "676d940286038fb0ee950795",
  "676d95c686038fb0ee950e09",
  "676d988986038fb0ee95158e",
];

export const getPacksCollections = async (req: Request, res: Response) => {
  try {
    // Get user ID if authenticated
    let userId: string | null = null;
    try {
      if (req.header("Authorization")) {
        const token = extractToken(req.header("Authorization"));
        const decoded = await verifyAccessToken(token);
        userId = decoded.user.id;
      }
    } catch (error) {
      // Continue without authentication
    }

    // Find packs by hardcoded IDs with visibility conditions
    const packs = await StickerPack.find({
      _id: { $in: HARDCODED_PACK_IDS },
      $or: [{ isPrivate: false }, { isPrivate: true, isAuthorized: true }],
      stickers: { $exists: true, $not: { $size: 0 } },
    });

    // Transform each pack using the same method as get_pack_by_id
    const transformedPacks = [];

    for (const pack of packs) {
      // Transform the pack with all details (same as get_pack_by_id)
      const packView = await transformPack(pack, {
        includeStickers: true,
        includeTotalCount: true,
        stickersLimit: 30,
        userId: userId,
        useCache: false,
      });

      if (packView) {
        // Check if pack is in user's favorites (same as get_pack_by_id)
        const isFavorite = userId
          ? (await User.exists({
              _id: userId,
              favoritesPacks: pack._id,
            })) !== null
          : false;

        transformedPacks.push({
          ...packView,
          isFavorite,
        });
      }
    }

    return sendSuccessResponse({
      res,
      message: "Packs retrieved successfully",
      data: transformedPacks,
    });
  } catch (err) {
    console.error("Get packs collections error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: err.message || "An unexpected error occurred while retrieving packs.",
      status: 500,
    });
  }
};
