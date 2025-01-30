import { Request, Response } from "express";
import { query } from "express-validator";
import { StickerPack } from "../../models/pack_model";
import { Category } from "../../models/category_model";
import User from "../../models/users_model";
import { Types } from "mongoose";
import { sendSuccessResponse, sendErrorResponse, PaginationInfo } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformPack } from "../../utils/responces_templates/response_views_transformer";

// Constants for validation and defaults
const SORT_OPTIONS = ["popular", "recent", "oldest"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const PACK_TYPE_OPTIONS = ["animated", "regular", "both"] as const;
type PackType = (typeof PACK_TYPE_OPTIONS)[number];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Validation rules
export const searchPacksValidationRules = [
  // Search terms
  query("query").optional().isString().trim(),
  query("categoryIds").optional().isArray().withMessage("Category IDs must be an array"),
  query("categoryIds.*").optional().isMongoId().withMessage("Invalid category ID format"),
  query("creatorName").optional().isString().trim(),

  // Filters
  query("packType").optional().isIn(PACK_TYPE_OPTIONS).withMessage("Invalid pack type. Must be animated, regular, or both"),

  query("minStickers").optional().isInt({ min: 1, max: 30 }).withMessage("Minimum stickers must be between 1 and 30"),

  query("maxStickers").optional().isInt({ min: 1, max: 30 }).withMessage("Maximum stickers must be between 1 and 30"),

  // Sorting
  query("sortBy").optional().isIn(SORT_OPTIONS).withMessage("Invalid sort option. Must be popular, recent, or oldest"),

  // Pagination
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),

  query("limit").optional().isInt({ min: 1, max: MAX_PAGE_SIZE }).withMessage(`Page size must be between 1 and ${MAX_PAGE_SIZE}`),
];

export const searchPacks = async (req: Request, res: Response) => {
  try {
    // Validate request
    const validationErrors = await validateRequest(req, res, searchPacksValidationRules);
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

    // Parse and type query parameters
    const {
      query: searchQuery = "",
      categoryIds,
      creatorName,
      packType = "both",
      minStickers,
      maxStickers,
      sortBy = "popular",
      page = 1,
      limit = DEFAULT_PAGE_SIZE,
    } = req.query as {
      query?: string;
      categoryIds?: string[];
      creatorName?: string;
      packType?: PackType;
      minStickers?: string;
      maxStickers?: string;
      sortBy?: SortOption;
      page?: string;
      limit?: string;
    };

    // Build base query
    const baseQuery: any = {
      isPrivate: false,
      isAuthorized: true,
    };

    // Add pack type filter
    if (packType !== "both") {
      baseQuery.isAnimatedPack = packType === "animated";
    }

    // Add sticker count filter
    if (minStickers !== undefined || maxStickers !== undefined) {
      baseQuery.$expr = {
        $and: [],
      };

      if (minStickers !== undefined) {
        baseQuery.$expr.$and.push({
          $gte: [{ $size: "$stickers" }, Number(minStickers)],
        });
      }

      if (maxStickers !== undefined) {
        baseQuery.$expr.$and.push({
          $lte: [{ $size: "$stickers" }, Number(maxStickers)],
        });
      }
    }

    // Handle category filtering and update search stats
    if (categoryIds && Array.isArray(categoryIds)) {
      const categoryObjectIds = categoryIds.map((id) => new Types.ObjectId(id.toString()));
      baseQuery.categories = { $in: categoryObjectIds };

      // Increment totalSearches for each category in parallel
      await Promise.all([
        // Update the search query
        Category.updateMany({ _id: { $in: categoryObjectIds } }, { $inc: { "stats.totalSearches": 1 } }),
        // Additionally log search timestamp if needed
        // You could add more tracking here if needed
      ]);
    }

    // Handle creator name search
    let creatorIds: Types.ObjectId[] = [];
    if (creatorName && typeof creatorName === "string") {
      const creators = await User.find({
        name: new RegExp(creatorName.trim(), "i"),
      }).select("_id");
      creatorIds = creators.map((creator) => creator.id);

      if (creatorIds.length === 0) {
        // No creators found, return empty result
        return sendSuccessResponse({
          res,
          message: "No packs found",
          data: {
            packs: [],
            pagination: {
              currentPage: 1,
              limit: Number(limit),
              totalPages: 0,
              totalItems: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
        });
      }

      baseQuery.creator = { $in: creatorIds };
    }

    // Add text search if query provided
    if (searchQuery && typeof searchQuery === "string") {
      baseQuery.$text = { $search: searchQuery };

      // Find and update categories that match the search query
      const matchingCategories = await Category.find({
        $or: [{ name: new RegExp(searchQuery.trim(), "i") }, { slug: new RegExp(searchQuery.trim(), "i") }],
      }).select("_id");

      if (matchingCategories.length > 0) {
        // Increment totalSearches for matching categories
        await Category.updateMany({ _id: { $in: matchingCategories.map((cat) => cat._id) } }, { $inc: { "stats.totalSearches": 1 } });
      }
    }

    // Determine sort options
    let sortOptions: any = {};
    switch (sortBy) {
      case "popular":
        sortOptions = { "stats.views": -1 };
        break;
      case "recent":
        sortOptions = { createdAt: -1 };
        break;
      case "oldest":
        sortOptions = { createdAt: 1 };
        break;
    }

    // Execute query with pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Get total count for pagination
    const totalItems = await StickerPack.countDocuments(baseQuery);

    // Get packs
    const packs = await StickerPack.find(baseQuery)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
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
          select: "name slug emoji trayIcon",
        },
        {
          path: "stickers",
          options: { sort: { position: 1 } },
        },
      ]);

    // Transform packs
    const transformedPacks = await Promise.all(packs.map((pack) => transformPack(pack)));

    // Calculate pagination info
    const totalPages = Math.ceil(totalItems / Number(limit));
    const pagination: PaginationInfo = {
      currentPage: Number(page),
      pageSize: Number(limit),
      totalPages,
      totalItems,
      hasNextPage: Number(page) < totalPages,
      hasPrevPage: Number(page) > 1,
    };

    return sendSuccessResponse({
      res,
      message: "Packs retrieved successfully",
      data: {
        packs: transformedPacks,
        pagination,
      },
    });
  } catch (err) {
    console.error("Pack search error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while searching for packs.",
      status: 500,
    });
  }
};
