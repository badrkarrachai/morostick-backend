import mongoose, { Types, Document } from "mongoose";
import { ICategory } from "../../interfaces/category_interface";
import { StickerView, PackView, CategoryView, CreatorView } from "../../interfaces/views_interface";
import { StickerPack } from "../../models/pack_model";
import { Sticker } from "../../models/sticker_model";
import { PACK_REQUIREMENTS } from "../../config/app_requirement";
import User from "../../models/users_model";

// Cache structure update to include favorites
const transformCache = {
  categories: new WeakMap<mongoose.Document, CategoryView>(),
  creators: new WeakMap<mongoose.Document, CreatorView>(),
  favorites: new Map<string, Set<string>>(), // userId -> Set of favorited sticker IDs
};

// Helper function to get user's favorites with cache control
async function getUserFavorites(userId: string | null, useCache: boolean = true): Promise<Set<string>> {
  if (!userId) return new Set();

  const cacheKey = userId.toString();
  if (useCache && transformCache.favorites.has(cacheKey)) {
    return transformCache.favorites.get(cacheKey)!;
  }

  try {
    const user = await User.findById(userId).select("favoritesStickers").lean();
    const favorites = new Set(user?.favoritesStickers?.map((id) => id.toString()) || []);

    if (useCache) {
      transformCache.favorites.set(cacheKey, favorites);
    }

    return favorites;
  } catch (error) {
    console.error("Error fetching user favorites:", error);
    return new Set();
  }
}

// Update transformStickerDirect to include isFavorite check
function transformStickerDirect(
  sticker: any,
  includeCreator = true,
  includeCategories = true,
  favorites: Set<string> = new Set(),
  useCache: boolean = true
): StickerView {
  return {
    id: sticker._id.toString(),
    packId: sticker.packId.toString(),
    name: sticker.name,
    emojis: sticker.emojis,
    thumbnailUrl: sticker.thumbnailUrl,
    webpUrl: sticker.webpUrl,
    isAnimated: sticker.isAnimated,
    fileSize: sticker.fileSize,
    creator: includeCreator ? transformCreator(sticker.creator, useCache) : null,
    dimensions: sticker.dimensions,
    format: sticker.format,
    categories: includeCategories ? sticker.categories.map((cat) => transformCategory(cat, useCache)) : null,
    position: sticker.position,
    stats: sticker.stats,
    isFavorite: favorites.has(sticker._id.toString()),
    createdAt: sticker.createdAt,
    updatedAt: sticker.updatedAt,
  };
}

// Optimized creator transform with optional caching
function transformCreator(user: any, useCache: boolean = true): CreatorView {
  if (useCache && transformCache.creators.has(user)) {
    return transformCache.creators.get(user)!;
  }

  const result = {
    id: user._id.toString(),
    name: user.name,
    avatarUrl: user.avatar?.url || "",
  };

  if (useCache && user instanceof mongoose.Document) {
    transformCache.creators.set(user, result);
  }

  return result;
}

// Transform a single category with optional caching
export function transformCategory(category: any, useCache: boolean = true): CategoryView {
  if (useCache && transformCache.categories.has(category)) {
    return transformCache.categories.get(category)!;
  }

  const result = {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description,
    emoji: category.emoji,
    trayIcon: category.trayIcon,
    isActive: category.isActive,
    order: category.order,
    isGenerated: category.isGenerated,
    tabindex: category.tabindex,
    stats: {
      packCount: category.stats.packCount,
      stickerCount: category.stats.stickerCount,
      totalViews: category.stats.totalViews,
      totalDownloads: category.stats.totalDownloads,
    },
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };

  if (useCache && category instanceof mongoose.Document) {
    transformCache.categories.set(category, result);
  }

  return result;
}

// Transform multiple categories with optional caching
export function transformCategories(
  categories: (Document | ICategory)[],
  options: {
    useCache?: boolean;
  } = {}
): CategoryView[] {
  const { useCache = true } = options;
  return categories.map((category) => transformCategory(category, useCache));
}

// Update transformSticker to include cache control
export async function transformSticker(
  input: string | Types.ObjectId | Document,
  options: {
    lean?: boolean;
    userId?: string | null;
    useCache?: boolean;
  } = {}
): Promise<StickerView | null> {
  const { lean = true, userId = null, useCache = true } = options;

  try {
    const query = Sticker.findById(input instanceof Document ? input._id : input)
      .populate("categories")
      .populate({
        path: "creator",
        select: "name avatar",
        populate: {
          path: "avatar",
          model: "Image",
          select: "url",
        },
      });

    if (lean) {
      query.lean();
    }

    const [sticker, favorites] = await Promise.all([query, getUserFavorites(userId, useCache)]);

    if (!sticker) return null;

    return transformStickerDirect(sticker, true, true, favorites, useCache);
  } catch (error) {
    console.error("Error transforming sticker:", error);
    return null;
  }
}

// Update transformPack to include cache control
export async function transformPack(
  input: string | Types.ObjectId | Document,
  options: {
    stickersLimit?: number;
    includeStickers?: boolean;
    includeTotalCount?: boolean;
    lean?: boolean;
    userId?: string | null;
    useCache?: boolean;
  } = {}
): Promise<PackView | null> {
  const {
    stickersLimit = PACK_REQUIREMENTS.maxPreviewStickers,
    includeStickers = true,
    includeTotalCount = true,
    lean = true,
    userId = null,
    useCache = true,
  } = options;

  try {
    const query = StickerPack.findById(input instanceof Document ? input._id : input)
      .populate("categories")
      .populate({
        path: "creator",
        select: "name avatar",
        populate: {
          path: "avatar",
          model: "Image",
          select: "url",
        },
      });

    if (includeStickers) {
      query.populate({
        path: "stickers",
        options: {
          limit: stickersLimit,
          sort: { position: 1 },
        },
        populate: [
          {
            path: "creator",
            select: "name avatar",
            populate: {
              path: "avatar",
              model: "Image",
              select: "url",
            },
          },
          { path: "categories" },
        ],
      });
    }

    if (lean) {
      query.lean();
    }

    const [pack, totalStickers, favorites] = await Promise.all([
      query,
      includeTotalCount
        ? Sticker.countDocuments({
            packId: input instanceof Document ? input._id : input,
          })
        : Promise.resolve(0),
      getUserFavorites(userId, useCache),
    ]);

    if (!pack) return null;

    return {
      id: pack._id.toString(),
      name: pack.name,
      description: pack.description,
      trayIcon: pack.trayIcon,
      creator: transformCreator(pack.creator, useCache),
      stickers: includeStickers ? pack.stickers.map((sticker) => transformStickerDirect(sticker, false, false, favorites, useCache)) : [],
      isPrivate: pack.isPrivate,
      isAuthorized: pack.isAuthorized,
      isAnimatedPack: pack.isAnimatedPack,
      categories: pack.categories.map((cat) => transformCategory(cat, useCache)),
      totalStickers,
      stats: pack.stats,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
    };
  } catch (error) {
    console.error("Error transforming pack:", error);
    return null;
  }
}

// Batch processing helper
async function batchProcess<T, R>(items: T[], batchSize: number, processor: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  return results;
}

// Update batch processing functions to include cache control
export async function transformStickers(
  stickers: (string | Types.ObjectId | Document)[],
  options?: Parameters<typeof transformSticker>[1]
): Promise<StickerView[]> {
  const BATCH_SIZE = 20;
  return batchProcess(stickers, BATCH_SIZE, async (batch) => {
    const transformedBatch = await Promise.all(batch.map((sticker) => transformSticker(sticker, options)));
    return transformedBatch.filter((sticker): sticker is StickerView => sticker !== null);
  });
}

export async function transformPacks(
  packs: (string | Types.ObjectId | Document)[],
  options?: Parameters<typeof transformPack>[1]
): Promise<PackView[]> {
  const BATCH_SIZE = 10;
  return batchProcess(packs, BATCH_SIZE, async (batch) => {
    const transformedBatch = await Promise.all(batch.map((pack) => transformPack(pack, options)));
    return transformedBatch.filter((pack): pack is PackView => pack !== null);
  });
}

// Clear transform caches periodically
setInterval(() => {
  transformCache.categories = new WeakMap();
  transformCache.creators = new WeakMap();
  transformCache.favorites.clear();
}, 5 * 60 * 1000); // Clear every 5 minutes
