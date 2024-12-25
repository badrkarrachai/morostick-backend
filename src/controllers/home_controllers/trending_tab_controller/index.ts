import { Request, Response } from "express";
import { Types, PipelineStage } from "mongoose";
import { StickerPack } from "../../../models/pack_model";
import User from "../../../models/users_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { query } from "express-validator";
import { PACK_REQUIREMENTS } from "../../../config/app_requirement";
import { Category } from "../../../models/category_model";
import { ICategory } from "../../../interfaces/category_interface";
import { CategoryView, PackView } from "../../../interfaces/views_interface";
import {
  transformCategories,
  transformPacks,
} from "../../../utils/responces_templates/response_views_transformer";

export const getTrendingValidationRules = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than 0"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
  query("categoryId").optional().isMongoId().withMessage("Invalid category ID"),
];

interface TrendingResponse {
  topCategories: CategoryView[];
  trending: {
    packs: PackView[];
    pagination: {
      currentPage: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

const getTopCategories = async (): Promise<CategoryView[]> => {
  const categories = await Category.find({ isActive: true })
    .sort({ order: 1, "stats.totalDownloads": -1 })
    .limit(10);
  const transformedCategories = await transformCategories(categories);
  return transformedCategories;
};

const getTrendingPacks = async (
  page: number,
  limit: number,
  categoryId?: string,
  userId?: string
): Promise<{ packs: PackView[]; total: number }> => {
  const skip = (page - 1) * limit;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get user favorites if logged in
  const userFavorites = userId
    ? await User.findById(userId)
        .select("favoritesPacks")
        .then((u) => u?.favoritesPacks || [])
    : [];

  const pipeline: PipelineStage[] = [
    {
      $match: {
        isPrivate: false,
        isAuthorized: true,
        createdAt: { $gte: thirtyDaysAgo },
        ...(categoryId && {
          categories: new Types.ObjectId(categoryId),
        }),
        ...(userId && {
          _id: { $nin: userFavorites },
        }),
      },
    },
    {
      $addFields: {
        trendingScore: {
          $add: [
            { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 10] },
            { $multiply: [{ $ifNull: ["$stats.views", 0] }, 5] },
            { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 8] },
            {
              $multiply: [
                {
                  $divide: [
                    1,
                    {
                      $add: [
                        {
                          $divide: [
                            { $subtract: [new Date(), "$createdAt"] },
                            86400000,
                          ],
                        },
                        1,
                      ],
                    },
                  ],
                },
                100,
              ],
            },
          ],
        },
      },
    },
    { $sort: { trendingScore: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const [packs, totalCount] = await Promise.all([
    StickerPack.aggregate(pipeline),
    StickerPack.countDocuments({
      isPrivate: false,
      isAuthorized: true,
      createdAt: { $gte: thirtyDaysAgo },
      ...(categoryId && {
        categories: new Types.ObjectId(categoryId),
      }),
      ...(userId && {
        _id: { $nin: userFavorites },
      }),
    }),
  ]);

  const transformedPacks = await transformPacks(packs);
  return {
    packs: transformedPacks,
    total: totalCount,
  };
};

export const getTrending = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      getTrendingValidationRules
    );

    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid parameters",
        errorCode: "INVALID_PARAMETERS",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: validationErrors,
        status: 400,
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const categoryId = req.query.categoryId as string;
    const userId = req.user?.id;

    const [topCategories, trendingPacks] = await Promise.all([
      getTopCategories(),
      getTrendingPacks(page, limit, categoryId, userId),
    ]);

    const totalPages = Math.ceil(trendingPacks.total / limit);

    const response: TrendingResponse = {
      topCategories,
      trending: {
        packs: trendingPacks.packs,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalPages,
          totalItems: trendingPacks.total,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };

    return sendSuccessResponse({
      res,
      message: "Trending content retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("Get trending error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        error instanceof Error ? error.message : "An unexpected error occurred",
      status: 500,
    });
  }
};
