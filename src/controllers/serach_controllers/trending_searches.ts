import { Request, Response } from "express";
import { Category } from "../../models/category_model";
import { Sticker } from "../../models/sticker_model";
import { StickerPack } from "../../models/pack_model";
import { Types } from "mongoose";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";

interface TrendingCategory {
  name: string;
  isHot: boolean;
  searchCount: number;
  previewSticker?: {
    id: string;
    webpUrl: string;
    name: string;
    packId: string;
  };
}

let trendingCache: {
  data: TrendingCategory[];
  timestamp: Date;
} | null = null;

const CACHE_DURATION = 1000 * 60 * 15; // 15 minutes cache duration

export const getTrendingSearches = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const DEFAULT_STICKER_URL = "https://pub-77ec04db39ef4d8bb8dc21139a0e97e1.r2.dev/defaultStickerIcon/MianSvgIcon.png";

    // Clear cache if needed
    if (req.query.clearCache === "true") {
      trendingCache = null;
    }

    // Check cache
    if (trendingCache && now.getTime() - trendingCache.timestamp.getTime() < CACHE_DURATION) {
      return sendSuccessResponse({
        res,
        message: "Cached trending searches retrieved successfully",
        data: {
          trending: trendingCache.data,
          lastUpdated: trendingCache.timestamp,
          fromCache: true,
        },
      });
    }

    const limit = Number(req.query.limit) || 16;

    // Get active categories
    const categories = await Category.find({
      isActive: true,
    })
      .sort({ "stats.totalSearches": -1, "stats.packCount": -1 })
      .limit(limit)
      .lean();

    // First, get all public packs
    const publicPacks = await StickerPack.find({
      isPrivate: false,
      isAuthorized: true,
    })
      .select("_id")
      .lean();

    const publicPackIds = publicPacks.map((pack) => pack._id);

    const trending: TrendingCategory[] = await Promise.all(
      categories.map(async (category) => {
        try {
          // Find stickers using pack ID and name matching
          const stickers = await Sticker.find({
            packId: { $in: publicPackIds },
            $or: [
              { categories: category._id },
              // Add any additional category matching logic here if needed
            ],
          })
            .sort({
              "stats.views": -1,
              "stats.favorites": -1,
              "stats.downloads": -1,
            })
            .limit(1)
            .lean();

          const popularSticker = stickers[0];

          // Calculate if category is "hot" based on activity
          const isHot = (category.stats.totalSearches || 0) > 0 || (category.stats.packCount || 0) > 0;

          // Create preview sticker object with either found sticker or default
          const previewSticker = popularSticker
            ? {
                id: popularSticker._id.toString(),
                webpUrl: popularSticker.webpUrl,
                name: popularSticker.name,
                packId: popularSticker.packId.toString(),
              }
            : {
                id: "default",
                webpUrl: DEFAULT_STICKER_URL,
                name: category.name,
                packId: "default",
              };

          return {
            name: category.name,
            isHot,
            searchCount: category.stats.totalSearches || 0,
            previewSticker, // Always include previewSticker now
          };
        } catch (err) {
          console.error(`Error processing category ${category.name}:`, err);
          return {
            name: category.name,
            isHot: false,
            searchCount: category.stats.totalSearches || 0,
            previewSticker: {
              id: "default",
              webpUrl: DEFAULT_STICKER_URL,
              name: category.name,
              packId: "default",
            },
          };
        }
      })
    );

    // Filter and sort trending categories
    const filteredTrending = trending.sort((a, b) => {
      // Sort by search count first, then by whether it's hot
      if (b.searchCount !== a.searchCount) {
        return b.searchCount - a.searchCount;
      }
      return b.isHot ? 1 : -1;
    });

    // Update cache
    trendingCache = {
      data: filteredTrending,
      timestamp: now,
    };

    return sendSuccessResponse({
      res,
      message: "Fresh trending searches retrieved successfully",
      data: {
        trending: filteredTrending,
        lastUpdated: now,
        fromCache: false,
      },
    });
  } catch (err) {
    console.error("Error fetching trending searches:", err);
    return sendErrorResponse({
      res,
      message: "Failed to fetch trending searches",
      errorCode: "TRENDING_FETCH_ERROR",
      errorDetails: err.message,
      status: 500,
    });
  }
};
