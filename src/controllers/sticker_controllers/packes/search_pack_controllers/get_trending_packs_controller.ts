import { Request, Response } from "express";
import { StickerPack } from "../../../../models/pack_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../../utils/response_handler_util";
import { query } from "express-validator";
import { validateRequest } from "../../../../utils/validations_util";
import { PipelineStage, Types } from "mongoose";
import { PackPreviewFormatter } from "../../../../utils/responces_templates/pack_response_template";
import { PACK_REQUIREMENTS } from "../../../../config/app_requirement";

interface AggregatedPack {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  creator: {
    _id: Types.ObjectId;
    username: string;
    avatarUrl?: string;
  };
  stickers: Types.ObjectId[];
  previewStickers: {
    _id: Types.ObjectId;
    name: string;
    webpUrl: string;
    thumbnailUrl: string;
    fileSize: number;
    dimensions: {
      width: number;
      height: number;
    };
    createdAt: Date;
    updatedAt: Date;
  }[];
  isAnimatedPack: boolean;
  stats: {
    downloads: number;
    views: number;
    favorites: number;
  };
  trendingScore: number;
}

export const getTrendingPacksValidationRules = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than 0"),
  query("timeframe")
    .optional()
    .isIn(["day", "week", "month", "all"])
    .withMessage("Invalid timeframe"),
  query("animated")
    .optional()
    .isBoolean()
    .withMessage("Animated must be a boolean value"),
];

export const getTrendingPacks = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      getTrendingPacksValidationRules
    );

    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid parameters",
        errorCode: "INVALID_PARAMETERS",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: Array.isArray(validationErrors)
          ? validationErrors.join(", ")
          : "Invalid parameters provided",
        status: 400,
      });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const timeframe = (req.query.timeframe as string) || "all";
    const animated = req.query.animated === "true";
    const skip = (page - 1) * limit;

    const dateFilter = getDateFilter(timeframe);

    const baseQuery = {
      isPrivate: false,
      isAuthorized: true,
      ...(animated !== undefined && { isAnimatedPack: animated }),
      ...(dateFilter && { createdAt: dateFilter }),
    };

    const aggregationPipeline: PipelineStage[] = [
      {
        $match: baseQuery,
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
      {
        $lookup: {
          from: "stickers",
          let: { stickerIds: "$stickers" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$stickerIds"] },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                webpUrl: 1,
                thumbnailUrl: 1,
                fileSize: 1,
                dimensions: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
            {
              $limit: PACK_REQUIREMENTS.maxPreviewStickers,
            },
          ],
          as: "previewStickers",
        },
      },
      {
        $sort: {
          trendingScore: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ];

    // Execute count and aggregation in parallel
    const [totalCount, rawPacks] = await Promise.all([
      StickerPack.countDocuments(baseQuery),
      StickerPack.aggregate<AggregatedPack>(aggregationPipeline),
    ]);

    // Format the packs using the formatter
    const formattedPacks = rawPacks.map((pack) =>
      PackPreviewFormatter.toPackPreview(pack)
    );

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return sendSuccessResponse({
      res,
      message: "Trending packs retrieved successfully",
      data: formattedPacks,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalPages,
        totalItems: totalCount,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Get trending packs error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while retrieving trending packs",
      status: 500,
    });
  }
};

function getDateFilter(timeframe: string): { $gte: Date } | null {
  const now = new Date();

  switch (timeframe) {
    case "day":
      return { $gte: new Date(now.setDate(now.getDate() - 1)) };
    case "week":
      return { $gte: new Date(now.setDate(now.getDate() - 7)) };
    case "month":
      return { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
    default:
      return null;
  }
}

export default getTrendingPacks;
