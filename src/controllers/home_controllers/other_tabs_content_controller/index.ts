import { Request, Response } from "express";
import { body, query } from "express-validator";
import { Category } from "../../../models/category_model";
import { StickerPack } from "../../../models/pack_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";

// Define the categories mapping
const CATEGORY_MAPPINGS = {
  Meme: ["Meme", "funny", "cute", "Funny", "Happy"],
  Cat: ["Cat", "Animals", "Kitty", "Kitten", "Pussycat"],
  Love: ["Love", "Bf", "Gf", "Cute", "Lovely"],
  Dog: ["Dog", "Animals", "Puppy", "Doggo", "Love"],
  Baby: ["Baby", "Animals", "Kitty", "Kitten", "Pussycat"],
  Reaction: ["Reaction", "Emoji", "Smile", "Laugh", "Cry"],
  Cute: ["Cute", "Funny", "Happy", "Love", "Lovely"],
  Anime: ["Anime", "Anime", "Anime", "Anime", "Anime"],
  Crypto: ["Crypto", "Crypto", "Crypto", "Crypto", "Crypto"],
  Emoji: ["Emoji", "Emoji", "Emoji", "Emoji", "Emoji"],
  // Add more mappings as needed
} as const;

type CategoryKey = keyof typeof CATEGORY_MAPPINGS;

// Validation rules
export const getPacksByCategoriesValidationRules = [
  body("categoryKey")
    .isString()
    .custom((value: string) => {
      return Object.keys(CATEGORY_MAPPINGS).includes(value);
    })
    .withMessage(
      "Sorry, there is no content for this category. Please try again with another category."
    ),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
  query("sortBy")
    .optional()
    .isIn(["downloads", "views", "favorites", "createdAt"])
    .withMessage("Invalid sort field"),
  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("Sort order must be 'asc' or 'desc'"),
];

export const getPacksByCategories = async (req: Request, res: Response) => {
  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      getPacksByCategoriesValidationRules
    );

    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: Array.isArray(validationErrors)
          ? validationErrors.join(", ")
          : validationErrors,
        status: 400,
      });
    }

    const { categoryKey } = req.body as { categoryKey: CategoryKey };
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as "asc" | "desc") || "desc";

    // Get category names from mapping
    const categoryNames = CATEGORY_MAPPINGS[categoryKey];

    // Find categories by names (case-insensitive)
    const categories = await Category.find({
      name: {
        $in: categoryNames.map((name) => new RegExp(`^${name}$`, "i")),
      },
      isActive: true,
    });

    if (!categories.length) {
      return sendErrorResponse({
        res,
        message: "Categories not found",
        errorCode: "CATEGORIES_NOT_FOUND",
        errorDetails:
          "Sorry, there is no content for this category. Please try again with another category.",
        status: 404,
      });
    }

    const categoryIds = categories.map((category) => category._id);

    // Build sort object
    const sortObj: Record<string, 1 | -1> = {};
    if (sortBy.startsWith("stats.")) {
      sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;
    } else {
      sortObj[`stats.${sortBy}`] = sortOrder === "asc" ? 1 : -1;
    }
    sortObj["createdAt"] = -1; // Secondary sort by creation date

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Find packs with matching categories
    const [packs, totalPacks] = await Promise.all([
      StickerPack.find({
        categories: { $in: categoryIds },
        isPrivate: false,
        isAuthorized: true,
      })
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate("categories")
        .populate({
          path: "creator",
          select: "name avatar",
          populate: {
            path: "avatar",
            model: "Image",
            select: "url",
          },
        }),
      StickerPack.countDocuments({
        categories: { $in: categoryIds },
        isPrivate: false,
        isAuthorized: true,
      }),
    ]);

    // Transform packs
    const transformedPacks = await transformPacks(packs, {
      includeStickers: true,
      stickersLimit: 5,
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalPacks / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return sendSuccessResponse({
      res,
      message: "Packs retrieved successfully",
      data: transformedPacks,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalPages,
        totalItems: totalPacks,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (err) {
    console.error("Error fetching packs by categories:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while fetching packs. Please try again later.",
      status: 500,
    });
  }
};
