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
import { PackPreviewFormatter } from "../../../../utils/responces_templates/pack_response_template";

export const searchPacksValidationRules = [
  query("q").optional().isString().trim(),
  query("creator").optional().isString().trim(),
  query("animated").optional().isBoolean(),
  query("tags").optional().isString(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than 0"),
  query("searchBy")
    .optional()
    .isIn(["all", "name", "description", "creator", "tags"])
    .withMessage("Invalid search parameter"),
];

interface SearchQuery {
  isAuthorized: boolean;
  isPrivate?: boolean;
  isAnimatedPack?: boolean;
  $or?: Array<{
    [key: string]: any;
  }>;
  $text?: { $search: string };
  "creator._id"?: Types.ObjectId | { $in: Types.ObjectId[] };
}

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
      limit = 20,
      page = 1,
      searchBy = "all",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const userId = req.user?.id;

    // Build base query
    const baseQuery: SearchQuery = {
      isAuthorized: true,
    };

    // Handle private packs visibility
    if (userId) {
      baseQuery.$or = [
        { isPrivate: false },
        { "creator._id": new Types.ObjectId(userId) },
      ];
    } else {
      baseQuery.isPrivate = false;
    }

    // Add animation filter if specified
    if (animated !== undefined) {
      baseQuery.isAnimatedPack = animated === "true";
    }

    // Handle creator search
    if (creator && typeof creator === "string") {
      // First, find the user by name, email, or social media handles
      const userQuery = {
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
      };

      const users = await User.find(userQuery).select("_id");
      const userIds = users.map((user) => user._id);

      if (userIds.length > 0) {
        (baseQuery as any)["creator._id"] = { $in: userIds };
      } else {
        // If no users found, ensure no results are returned
        baseQuery["creator._id"] = new Types.ObjectId(
          "000000000000000000000000"
        );
      }
    }

    // Build search conditions based on searchBy parameter and query
    if (q) {
      const searchQuery = typeof q === "string" ? q : q[0];
      switch (searchBy) {
        case "name":
          baseQuery.$or = [{ name: { $regex: searchQuery, $options: "i" } }];
          break;
        case "description":
          baseQuery.$or = [
            { description: { $regex: searchQuery, $options: "i" } },
          ];
          break;
        case "creator":
          // This will be handled by the creator search above
          break;
        case "tags":
          // Handled in aggregation pipeline
          break;
        case "all":
        default:
          baseQuery.$text = { $search: searchQuery };
          break;
      }
    }

    // Split tags into array if provided
    const tagArray =
      typeof tags === "string" ? tags.split(",").map((tag) => tag.trim()) : [];

    // Build aggregation pipeline
    const aggregationPipeline: PipelineStage[] = [
      {
        $match: baseQuery,
      },
    ];

    // Add tag search if specified
    if (tagArray.length > 0) {
      aggregationPipeline.push(
        {
          $lookup: {
            from: "stickers",
            let: { packStickers: "$stickers" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$packStickers"] },
                  tags: { $in: tagArray },
                },
              },
            ],
            as: "matchedStickers",
          },
        },
        {
          $match: {
            matchedStickers: { $ne: [] },
          },
        }
      );
    }

    // Add preview stickers and creator info lookup
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
              $limit: 4,
            },
          ],
          as: "previewStickers",
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: Number(limit),
      }
    );

    // Execute count and search in parallel
    const [totalCount, packs] = await Promise.all([
      StickerPack.countDocuments(baseQuery),
      StickerPack.aggregate(aggregationPipeline),
    ]);

    // Format the results
    const formattedPacks = packs.map((pack) =>
      PackPreviewFormatter.toPackPreview(pack)
    );

    const totalPages = Math.ceil(totalCount / Number(limit));
    const hasNextPage = Number(page) < totalPages;
    const hasPrevPage = Number(page) > 1;

    return sendSuccessResponse<IPackPreview[]>({
      res,
      message: "Search completed successfully",
      data: formattedPacks,
      pagination: {
        currentPage: Number(page),
        pageSize: Number(limit),
        totalPages,
        totalItems: totalCount,
        hasNextPage,
        hasPrevPage,
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
