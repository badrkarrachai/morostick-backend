import { Request, Response } from "express";
import { query } from "express-validator";
import User from "../../models/users_model";
import { Sticker } from "../../models/sticker_model";
import { sendSuccessResponse, sendErrorResponse, PaginationInfo } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformSticker } from "../../utils/responces_templates/response_views_transformer";

export const getFavoriteStickersValidationRules = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("type").optional().isIn(["all", "regular", "animated"]).withMessage("Type must be 'all', 'regular', or 'animated'"),
];

export const getFavoriteStickers = async (req: Request, res: Response) => {
  try {
    // Validate request
    const validationErrors = await validateRequest(req, res, getFavoriteStickersValidationRules);

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

    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const type = (req.query.type as string) || "all";

    // Find user and their favorite sticker IDs
    const user = await User.findById(userId).select("favoritesStickers");
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "User account not found",
        status: 404,
      });
    }

    // If user has no favorites, return early
    if (!user.favoritesStickers?.length) {
      return sendSuccessResponse({
        res,
        message: "No favorite stickers found",
        data: [],
        pagination: {
          currentPage: 1,
          pageSize: limit,
          totalPages: 0,
          totalItems: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }

    // Build query for stickers
    const baseQuery: any = {
      _id: { $in: user.favoritesStickers },
    };

    // Add type filter if specified
    if (type !== "all") {
      baseQuery["isAnimated"] = type === "animated";
    }

    // Get total count for pagination
    const totalStickers = await Sticker.countDocuments(baseQuery);
    const totalPages = Math.ceil(totalStickers / limit);
    const skip = (page - 1) * limit;

    // Fetch stickers (without sorting here since we need to preserve favorites order)
    const favoriteStickers = await Sticker.find(baseQuery).populate([
      {
        path: "packId",
        select: "name isPrivate isAuthorized isAnimatedPack creator categories",
        // Remove match condition to get all packs, we'll filter manually
        populate: [
          {
            path: "creator",
            select: "name avatar",
            populate: {
              path: "avatar",
              select: "url",
            },
          },
          {
            path: "categories",
            select: "name slug emoji",
          },
        ],
      },
      {
        path: "creator",
        select: "name avatar",
        populate: {
          path: "avatar",
          select: "url",
        },
      },
      {
        path: "categories",
        select: "name slug emoji",
      },
    ]);

    // Filter stickers: include those from public+authorized packs OR packs owned by the user
    const validStickers = favoriteStickers.filter((sticker) => {
      if (!sticker.packId) return false;

      const pack = sticker.packId as any;
      const isUserOwner = pack.creator && pack.creator._id.toString() === userId;

      // Include if pack is public and authorized, OR if user owns the pack
      return (!pack.isPrivate && pack.isAuthorized) || isUserOwner;
    });

    // Sort stickers by the order they appear in user's favorites array (newest first)
    // Reverse the favorites array so newest favorites (at the end) come first
    const reversedFavorites = [...user.favoritesStickers].reverse();
    const sortedStickers = validStickers.sort((a, b) => {
      const aIndex = reversedFavorites.findIndex((id) => id.equals(a._id as any));
      const bIndex = reversedFavorites.findIndex((id) => id.equals(b._id as any));
      return aIndex - bIndex;
    });

    // Apply pagination to sorted results
    const paginatedStickers = sortedStickers.slice(skip, skip + limit);

    // Transform stickers to include favorite status
    const stickerViews = await Promise.all(
      paginatedStickers.map(async (sticker) => ({
        ...(await transformSticker(sticker)),
        isFavorite: true,
      }))
    );

    // Prepare pagination info (use valid stickers count for actual returned data)
    const paginationInfo: PaginationInfo = {
      currentPage: page,
      pageSize: limit,
      totalPages,
      totalItems: totalStickers,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    return sendSuccessResponse({
      res,
      message: "Favorite stickers retrieved successfully",
      data: stickerViews,
      pagination: paginationInfo,
    });
  } catch (err) {
    console.error("Get favorite stickers error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while retrieving favorite stickers.",
      status: 500,
    });
  }
};
