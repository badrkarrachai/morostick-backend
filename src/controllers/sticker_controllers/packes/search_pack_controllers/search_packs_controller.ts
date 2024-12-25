import { Request, Response } from "express";
import { StickerPack } from "../../../../models/pack_model";
import { Sticker } from "../../../../models/sticker_model";
import User from "../../../../models/users_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../../utils/response_handler_util";
import { validateRequest } from "../../../../utils/validations_util";
import { query } from "express-validator";
import { Types, PipelineStage } from "mongoose";
import { IPackPreview } from "../../../../interfaces/pack_interface";
import { PackPreviewFormatter } from "../../../../utils/responces_templates/response_views_transformer";
import { PACK_REQUIREMENTS } from "../../../../config/app_requirement";

export const searchPacksValidationRules = [
  query("q").optional().isString().trim(),
  query("creator").optional().isString().trim(),
  query("animated").optional().isBoolean(),
  query("tags").optional().isString(),
  query("timeRange")
    .optional()
    .isIn(["today", "week", "month", "year", "all"])
    .withMessage("Invalid time range"),
  query("sortBy")
    .optional()
    .isIn(["relevance", "popular", "recent"])
    .withMessage("Invalid sort parameter"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than 0"),
];

const getTimeRangeFilter = (timeRange: string): Date | null => {
  const now = new Date();
  switch (timeRange) {
    case "today":
      return new Date(now.setHours(0, 0, 0, 0));
    case "week":
      return new Date(now.setDate(now.getDate() - 7));
    case "month":
      return new Date(now.setMonth(now.getMonth() - 1));
    case "year":
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return null;
  }
};

const calculateRelevanceScore = (): PipelineStage => ({
  $addFields: {
    relevanceScore: {
      $add: [
        // Popularity factors
        { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 10] },
        { $multiply: [{ $ifNull: ["$stats.views", 0] }, 5] },
        { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 15] },

        // Time decay factor
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

        // Sticker count factor
        {
          $multiply: [{ $size: "$stickers" }, 5],
        },

        // Matching stickers boost
        {
          $multiply: [{ $size: "$matchedStickers" }, 20],
        },
      ],
    },
  },
});

export const searchPacks = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      searchPacksValidationRules
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

    const {
      q = "",
      creator,
      animated,
      tags,
      timeRange = "all",
      sortBy = "relevance",
      limit = 20,
      page = 1,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const userId = req.user?.id;

    // Base query with improved visibility handling
    const baseQuery: any = {
      isAuthorized: true,
      $and: [
        userId
          ? {
              $or: [
                { isPrivate: false },
                { "creator._id": new Types.ObjectId(userId) },
              ],
            }
          : { isPrivate: false },
      ],
    };

    // Add animation filter
    if (animated !== undefined) {
      baseQuery.isAnimatedPack = animated === "true";
    }

    // Add time range filter
    const timeFilter = getTimeRangeFilter(timeRange as string);
    if (timeFilter) {
      baseQuery.createdAt = { $gte: timeFilter };
    }

    // Handle creator search
    if (creator && typeof creator === "string") {
      const users = await User.find({
        isDeleted: false,
        isActivated: true,
        $or: [
          { name: { $regex: creator.trim(), $options: "i" } },
          { email: { $regex: creator.trim(), $options: "i" } },
          { "socialMedia.facebook": { $regex: creator.trim(), $options: "i" } },
          { "socialMedia.x": { $regex: creator.trim(), $options: "i" } },
          {
            "socialMedia.instagram": { $regex: creator.trim(), $options: "i" },
          },
        ],
      }).select("_id");

      if (users.length > 0) {
        baseQuery["creator._id"] = { $in: users.map((user) => user._id) };
      } else {
        baseQuery["creator._id"] = new Types.ObjectId(
          "000000000000000000000000"
        );
      }
    }

    // Build aggregation pipeline
    const aggregationPipeline: PipelineStage[] = [
      // Initial match to filter authorized and private packs
      { $match: baseQuery },
    ];

    // Add sticker lookup for searching tags and emojis
    if (q || tags) {
      const searchQuery = typeof q === "string" ? q.trim() : "";
      const tagArray =
        typeof tags === "string"
          ? tags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          : [];

      aggregationPipeline.push(
        // Lookup all stickers for the pack
        {
          $lookup: {
            from: "stickers",
            let: { packStickers: "$stickers" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$packStickers"] },
                  ...(searchQuery && {
                    $or: [
                      { name: { $regex: searchQuery, $options: "i" } },
                      { tags: { $regex: searchQuery, $options: "i" } },
                      { emojis: { $regex: searchQuery, $options: "i" } },
                    ],
                  }),
                  ...(tagArray.length > 0 && {
                    tags: { $in: tagArray },
                  }),
                },
              },
            ],
            as: "matchedStickers",
          },
        }
      );

      // If there's a search query, match packs with either matching stickers or pack details
      if (searchQuery) {
        aggregationPipeline.push({
          $match: {
            $or: [
              { name: { $regex: searchQuery, $options: "i" } },
              { description: { $regex: searchQuery, $options: "i" } },
              { "creator.username": { $regex: searchQuery, $options: "i" } },
              { matchedStickers: { $ne: [] } },
            ],
          },
        });
      }

      // If there are tags, ensure we have matching stickers
      if (tagArray.length > 0) {
        aggregationPipeline.push({
          $match: {
            matchedStickers: { $ne: [] },
          },
        });
      }
    }

    // Add relevance scoring
    aggregationPipeline.push(calculateRelevanceScore());

    // Add sorting based on user preference
    switch (sortBy) {
      case "popular":
        aggregationPipeline.push({
          $sort: {
            "stats.downloads": -1,
            "stats.favorites": -1,
            "stats.views": -1,
          },
        });
        break;
      case "recent":
        aggregationPipeline.push({
          $sort: { createdAt: -1 },
        });
        break;
      case "relevance":
      default:
        aggregationPipeline.push({
          $sort: { relevanceScore: -1 },
        });
    }

    // Add preview stickers lookup
    aggregationPipeline.push(
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
              $set: {
                _id: "$_id", // Ensure _id is preserved
              },
            },
            {
              $sort: { position: 1 },
            },
            {
              $limit: PACK_REQUIREMENTS.maxPreviewStickers,
            },
          ],
          as: "previewStickers",
        },
      },
      { $skip: skip },
      { $limit: Number(limit) }
    );

    // Execute search
    const [totalCount, packs] = await Promise.all([
      StickerPack.countDocuments(baseQuery),
      StickerPack.aggregate(aggregationPipeline),
    ]);

    const formattedPacks = packs.map((pack) =>
      PackPreviewFormatter.toPackPreview(pack)
    );

    const totalPages = Math.ceil(totalCount / Number(limit));

    return sendSuccessResponse<IPackPreview[]>({
      res,
      message: "Search completed successfully",
      data: formattedPacks,
      pagination: {
        currentPage: Number(page),
        pageSize: Number(limit),
        totalPages,
        totalItems: totalCount,
        hasNextPage: Number(page) < totalPages,
        hasPrevPage: Number(page) > 1,
      },
    });
  } catch (error) {
    console.error("Pack search error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while searching packs",
      status: 500,
    });
  }
};

export default searchPacks;
