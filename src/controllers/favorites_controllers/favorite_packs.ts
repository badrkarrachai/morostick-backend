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

    // Build query for packs
    const baseQuery = {
      _id: { $in: user.favoritesPacks },
      isPrivate: false,
      isAuthorized: true,
    };

    // Add type filter if specified
    if (type !== "all") {
      baseQuery["isAnimatedPack"] = type === "animated";
    }

    // Get total count for pagination
    const totalPacks = await StickerPack.countDocuments(baseQuery);
    const totalPages = Math.ceil(totalPacks / limit);
    const skip = (page - 1) * limit;

    // Fetch packs with pagination
    const favoritePacks = await StickerPack.find(baseQuery)
      .populate([
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
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform packs
    const packViews = await Promise.all(favoritePacks.map((pack) => transformPack(pack)));

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
