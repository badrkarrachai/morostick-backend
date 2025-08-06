import { Request, Response } from "express";
import { query } from "express-validator";
import User from "../../models/users_model";
import { StickerPack } from "../../models/pack_model";
import { sendSuccessResponse, sendErrorResponse, PaginationInfo } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformPack } from "../../utils/responces_templates/response_views_transformer";

export const getFavoritePacksValidationRules = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("type").optional().isIn(["all", "regular", "animated"]).withMessage("Type must be 'all', 'regular', or 'animated'"),
];

export const getFavoritePacks = async (req: Request, res: Response) => {
  try {
    // Validate request
    const validationErrors = await validateRequest(req, res, getFavoritePacksValidationRules);

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
    const limit = parseInt(req.query.limit as string) || 20;
    const type = (req.query.type as string) || "all";

    // Find user and their favorite pack IDs
    const user = await User.findById(userId).select("favoritesPacks");
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
    if (!user.favoritesPacks?.length) {
      return sendSuccessResponse({
        res,
        message: "No favorite packs found",
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

    // Build query for packs
    const baseQuery = {
      _id: { $in: user.favoritesPacks },
      $or: [
        { isPrivate: false, isAuthorized: true }, // Public authorized packs
        { isPrivate: true, creator: userId }, // Private packs owned by user
      ],
    };

    // Add type filter if specified
    if (type !== "all") {
      baseQuery["isAnimatedPack"] = type === "animated";
    }

    // Get total count for pagination
    const totalPacks = await StickerPack.countDocuments(baseQuery);
    const totalPages = Math.ceil(totalPacks / limit);
    const skip = (page - 1) * limit;

    // Fetch packs (without sorting here since we need to preserve favorites order)
    const favoritePacks = await StickerPack.find(baseQuery).populate([
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
      {
        path: "stickers",
        select: "thumbnailUrl webpUrl name emojis stats dimensions isAnimated fileSize",
        options: { sort: { position: 1 } },
      },
    ]);

    // Sort packs by the order they appear in user's favorites array (newest first)
    // Reverse the favorites array so newest favorites (at the end) come first
    const reversedFavorites = [...user.favoritesPacks].reverse();
    const sortedPacks = favoritePacks.sort((a, b) => {
      const aIndex = reversedFavorites.findIndex((id) => id.equals(a._id as any));
      const bIndex = reversedFavorites.findIndex((id) => id.equals(b._id as any));
      return aIndex - bIndex;
    });

    // Apply pagination to sorted results
    const paginatedPacks = sortedPacks.slice(skip, skip + limit);

    // Transform packs
    const packViews = await Promise.all(paginatedPacks.map((pack) => transformPack(pack)));

    // Prepare pagination info
    const paginationInfo: PaginationInfo = {
      currentPage: page,
      pageSize: limit,
      totalPages,
      totalItems: totalPacks,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    return sendSuccessResponse({
      res,
      message: "Favorite packs retrieved successfully",
      data: packViews,
      pagination: paginationInfo,
    });
  } catch (err) {
    console.error("Get favorite packs error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while retrieving favorite packs.",
      status: 500,
    });
  }
};
