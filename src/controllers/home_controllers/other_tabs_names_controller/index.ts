import { query } from "express-validator";
import { CategoryView } from "../../../interfaces/views_interface";
import { validateRequest } from "../../../utils/validations_util";
import { Request, Response } from "express";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../../../utils/response_handler_util";
import { getCategoryTabsByNames } from "./get_category_tabs";

interface TopCategoriesTabsResponse {
  topCategoryTabs: CategoryView[];
}

//!!! Tabs
const categories = [
  "Meme",
  "Cat",
  "Love",
  "Dog",
  "Baby",
  "Reaction",
  "Cute",
  "Anime",
  "Crypto",
  "Emoji",
];

export const getHomeTabsCategories = async (req: Request, res: Response) => {
  try {
    const [topCategoryTabs] = await Promise.all([
      getCategoryTabsByNames(categories),
    ]);

    const response: TopCategoriesTabsResponse = {
      topCategoryTabs,
    };

    return sendSuccessResponse({
      res,
      message: "Category tabs retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("Get category tabs error:", error);
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
