import { Request, Response } from "express";
import User from "../../../models/users_model";
import { validateRequest } from "../../../utils/validations_util";
import { query } from "express-validator";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { PackView } from "../../../interfaces/views_interface";
import { getRecommendedPacks } from "./get_recommended_packs";
import { getTrendingPacks } from "./get_trending_packs";
import { getSuggestedPacks } from "./get_suggested_packs";

interface UserPreferences {
  favoriteCreators: string[];
  favoriteTags: { [key: string]: number };
  animatedPreference: boolean;
  preferredCategories: string[];
  favoriteThemes: { [key: string]: number };
}

interface ForYouResponse {
  recommended: PackView[];
  trending: PackView[];
  suggested: {
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

export const getForYouValidationRules = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than 0"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
];

export const analyzeUserPreferences = async (
  userId: string
): Promise<UserPreferences | null> => {
  const user = await User.findById(userId)
    .populate("favoritesPacks")
    .populate("favoritesStickers")
    .populate("packs")
    .lean();

  if (!user) return null;

  const favoritePacks = user.favoritesPacks as any[];
  const favoriteStickers = user.favoritesStickers as any[];
  const userPacks = user.packs as any[];

  // Get unique categories from favorite packs and stickers
  const allCategories = [
    ...favoritePacks.flatMap((pack) => pack.categories || []),
    ...favoriteStickers.flatMap((sticker) => sticker.categories || []),
  ].map((cat) => cat.toString());

  return {
    favoriteCreators: [
      ...new Set([
        ...favoritePacks.flatMap((pack) =>
          pack.creator.map((c) => c.toString())
        ),
        ...favoriteStickers.map((sticker) => sticker.creator.toString()),
      ]),
    ],
    favoriteTags: favoriteStickers.reduce(
      (tags: { [key: string]: number }, sticker) => {
        (sticker.tags || []).forEach((tag) => {
          tags[tag] = (tags[tag] || 0) + 1;
        });
        return tags;
      },
      {}
    ),
    animatedPreference:
      favoriteStickers.filter((s) => s.isAnimated).length /
        Math.max(favoriteStickers.length, 1) >
      0.5,
    preferredCategories: [...new Set(allCategories)],
    favoriteThemes: [...favoritePacks, ...userPacks].reduce(
      (themes: { [key: string]: number }, pack) => {
        const words = `${pack.name} ${pack.description || ""}`
          .toLowerCase()
          .split(/\W+/)
          .filter((word) => word.length > 3);
        words.forEach((word) => {
          themes[word] = (themes[word] || 0) + 1;
        });
        return themes;
      },
      {}
    ),
  };
};

export const getForYou = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      getForYouValidationRules
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
    const userId = req.user?.id;

    const [recommended, trending, suggested] = await Promise.all([
      getRecommendedPacks(userId),
      getTrendingPacks(userId),
      getSuggestedPacks(page, limit, userId),
    ]);

    const totalPages = Math.ceil(suggested.total / limit);

    const response: ForYouResponse = {
      recommended,
      trending,
      suggested: {
        packs: suggested.packs,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalPages,
          totalItems: suggested.total,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };

    return sendSuccessResponse({
      res,
      message: "For You content retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("Get For You content error:", error);
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
