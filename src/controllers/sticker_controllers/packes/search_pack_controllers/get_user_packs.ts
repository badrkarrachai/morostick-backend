import { Request, Response } from "express";
import { Types, PipelineStage } from "mongoose";
import { StickerPack } from "../../../../models/pack_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../../utils/response_handler_util";
import { validateRequest } from "../../../../utils/validations_util";
import { body, query } from "express-validator";
import { IPackPreview } from "../../../../interfaces/pack_interface";
import { PackPreviewFormatter } from "../../../../utils/responces_templates/pack_response_template";
import { PACK_REQUIREMENTS } from "../../../../config/app_requirement";

export const getUserPrivatePacksValidationRules = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than 0"),
  query("sortBy")
    .optional()
    .isIn(["name", "recent", "popular"])
    .withMessage("Invalid sort parameter"),
  query("order")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("Invalid order parameter"),
  query("search")
    .optional()
    .isString()
    .trim()
    .withMessage("Search query must be a string"),
  query("animated")
    .optional()
    .isBoolean()
    .withMessage("Animated must be a boolean value"),
  body("isPrivate")
    .exists()
    .withMessage("Private pack status is required")
    .isBoolean()
    .withMessage("Invalid private pack status"),
];

export const getUserPrivatePacks = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      getUserPrivatePacksValidationRules
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
          : validationErrors,
        status: 400,
      });
    }

    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const sortBy = (req.query.sortBy as string) || "recent";
    const order = (req.query.order as string) || "desc";
    const search = (req.query.search as string) || "";
    const animated = req.query.animated === "true";
    const skip = (page - 1) * limit;
    const isPrivate = req.body.isPrivate;

    // Base query
    const baseQuery: any = {
      "creator._id": new Types.ObjectId(userId),
      isPrivate: isPrivate,
    };

    // Add animation filter if specified
    if (req.query.animated !== undefined) {
      baseQuery.isAnimatedPack = animated;
    }

    // Add search conditions if search query exists
    if (search) {
      baseQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const aggregationPipeline: PipelineStage[] = [
      { $match: baseQuery },
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
                position: 1,
                createdAt: 1,
                updatedAt: 1,
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
    ];

    // Add popular score calculation if sorting by popular
    if (sortBy === "popular") {
      aggregationPipeline.push({
        $addFields: {
          popularityScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 10] },
              { $multiply: [{ $ifNull: ["$stats.views", 0] }, 5] },
              { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 15] },
            ],
          },
        },
      });
    }

    // Add sorting
    const sortStage: PipelineStage = {
      $sort: {},
    };

    switch (sortBy) {
      case "name":
        sortStage.$sort = { name: order === "asc" ? 1 : -1 };
        break;
      case "popular":
        sortStage.$sort = { popularityScore: order === "asc" ? 1 : -1 };
        break;
      case "recent":
      default:
        sortStage.$sort = { createdAt: order === "asc" ? 1 : -1 };
    }

    aggregationPipeline.push(sortStage);

    // Add pagination
    aggregationPipeline.push({ $skip: skip }, { $limit: limit });

    // Execute count and aggregation in parallel
    const [totalCount, packs] = await Promise.all([
      StickerPack.countDocuments(baseQuery),
      StickerPack.aggregate(aggregationPipeline),
    ]);

    const formattedPacks = packs.map((pack) =>
      PackPreviewFormatter.toPackPreview(pack)
    );

    const totalPages = Math.ceil(totalCount / limit);

    return sendSuccessResponse<IPackPreview[]>({
      res,
      message: "Private packs retrieved successfully",
      data: formattedPacks,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalPages,
        totalItems: totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get user private packs error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while retrieving private packs",
      status: 500,
    });
  }
};

export default getUserPrivatePacks;
