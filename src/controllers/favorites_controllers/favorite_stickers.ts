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

    const matchType = type !== "all" ? { isAnimated: type === "animated" } : {};

    // Get total count
    const totalStickers = await Sticker.aggregate([
      {
        $match: {
          _id: { $in: user.favoritesStickers },
        },
      },
      {
        $lookup: {
          from: "packs",
          localField: "packId",
          foreignField: "_id",
          as: "packId",
        },
      },
      {
        $unwind: "$packId",
      },
      {
        $match: {
          "packId.isPrivate": false,
          "packId.isAuthorized": true,
          ...matchType,
        },
      },
      {
        $count: "total",
      },
    ]);

    const total = totalStickers[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Get favorite stickers with all necessary data
    const favoriteStickers = await Sticker.aggregate([
      {
        $match: {
          _id: { $in: user.favoritesStickers },
        },
      },
      {
        $lookup: {
          from: "packs",
          localField: "packId",
          foreignField: "_id",
          as: "packId",
        },
      },
      {
        $unwind: "$packId",
      },
      {
        $match: {
          "packId.isPrivate": false,
          "packId.isAuthorized": true,
          ...matchType,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $unwind: "$creator",
      },
      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $sort: { createdAt: -1 }, // Sort by newest first
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ]);

    // Transform stickers to include favorite status
    const stickerViews = await Promise.all(
      favoriteStickers.map(async (sticker) => ({
        ...(await transformSticker(sticker)),
        isFavorite: true,
      }))
    );

    // Prepare pagination info
    const paginationInfo: PaginationInfo = {
      currentPage: page,
      pageSize: limit,
      totalPages,
      totalItems: total,
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
