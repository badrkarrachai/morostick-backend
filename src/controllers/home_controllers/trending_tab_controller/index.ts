import { Request, Response } from "express";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { query } from "express-validator";
import { CategoryView, PackView } from "../../../interfaces/views_interface";
import { getCategoriesByNames } from "./get_top_categories";
import { getTrendingPacks } from "./get_trending_packs";

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

const categories = ["Meme", "Cat", "Love", "Dog"];

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
      getCategoriesByNames(categories),
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
