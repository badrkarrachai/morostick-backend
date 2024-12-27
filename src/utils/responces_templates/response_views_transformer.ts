import mongoose, { Types, Document } from "mongoose";
import { ICategory } from "../../interfaces/category_interface";
import {
  StickerView,
  PackView,
  CategoryView,
  CreatorView,
} from "../../interfaces/views_interface";
import { StickerPack } from "../../models/pack_model";
import { Sticker } from "../../models/sticker_model";
import { PACK_REQUIREMENTS } from "../../config/app_requirement";

// Use WeakMap for better memory management
const transformCache = {
  categories: new WeakMap<mongoose.Document, CategoryView>(),
  creators: new WeakMap<mongoose.Document, CreatorView>(),
};

// Batch processing helper
async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  return results;
}

// Optimized creator transform with caching
function transformCreator(user: any): CreatorView {
  if (transformCache.creators.has(user)) {
    return transformCache.creators.get(user)!;
  }

  const result = {
    id: user._id.toString(),
    name: user.name,
    avatarUrl: user.avatar?.url || "",
  };

  if (user instanceof mongoose.Document) {
    transformCache.creators.set(user, result);
  }

  return result;
}

// Transform a single category
export function transformCategory(category: any): CategoryView {
  if (transformCache.categories.has(category)) {
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

  if (category instanceof mongoose.Document) {
    transformCache.categories.set(category, result);
  }

  return result;
}

// New function to transform multiple categories
export function transformCategories(
  categories: (Document | ICategory)[]
): CategoryView[] {
  return categories.map(transformCategory);
}

// Optimized sticker transform
function transformStickerDirect(
  sticker: any,
  includeCreator = true,
  includeCategories = true
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
    creator: includeCreator ? transformCreator(sticker.creator) : null,
    dimensions: sticker.dimensions,
    format: sticker.format,
    categories: includeCategories
      ? sticker.categories.map(transformCategory)
      : null,
    position: sticker.position,
    stats: sticker.stats,
    createdAt: sticker.createdAt,
    updatedAt: sticker.updatedAt,
  };
}

// Optimized pack transform with selective population
export async function transformPack(
  input: string | Types.ObjectId | Document,
  options: {
    stickersLimit?: number;
    includeStickers?: boolean;
    includeTotalCount?: boolean;
    lean?: boolean;
  } = {}
): Promise<PackView | null> {
  const {
    stickersLimit = PACK_REQUIREMENTS.maxPreviewStickers,
    includeStickers = true,
    includeTotalCount = true,
    lean = true,
  } = options;

  try {
    const query = StickerPack.findById(
      input instanceof Document ? input._id : input
    )
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

    const [pack, totalStickers] = await Promise.all([
      query,
      includeTotalCount
        ? Sticker.countDocuments({
            packId: input instanceof Document ? input._id : input,
          }) // Add caching if your MongoDB driver supports it
        : Promise.resolve(0),
    ]);

    if (!pack) return null;

    return {
      id: pack._id.toString(),
      name: pack.name,
      description: pack.description,
      trayIcon: pack.trayIcon,
      creator: transformCreator(pack.creator),
      stickers: includeStickers
        ? pack.stickers.map((sticker) =>
            transformStickerDirect(sticker, false, false)
          )
        : [],
      isPrivate: pack.isPrivate,
      isAuthorized: pack.isAuthorized,
      isAnimatedPack: pack.isAnimatedPack,
      categories: pack.categories.map(transformCategory),
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

// Optimized batch processing for multiple packs
export async function transformPacks(
  packs: (string | Types.ObjectId | Document)[],
  options?: Parameters<typeof transformPack>[1]
): Promise<PackView[]> {
  const BATCH_SIZE = 10;
  return batchProcess(packs, BATCH_SIZE, async (batch) => {
    const transformedBatch = await Promise.all(
      batch.map((pack) => transformPack(pack, options))
    );
    return transformedBatch.filter((pack): pack is PackView => pack !== null);
  });
}

// Optimized sticker transform with caching
export async function transformSticker(
  input: string | Types.ObjectId | Document,
  options: { lean?: boolean } = {}
): Promise<StickerView | null> {
  const { lean = true } = options;

  try {
    const query = Sticker.findById(
      input instanceof Document ? input._id : input
    )
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

    const sticker = await query;
    if (!sticker) return null;

    return transformStickerDirect(sticker);
  } catch (error) {
    console.error("Error transforming sticker:", error);
    return null;
  }
}

// Optimized batch processing for multiple stickers
export async function transformStickers(
  stickers: (string | Types.ObjectId | Document)[],
  options?: Parameters<typeof transformSticker>[1]
): Promise<StickerView[]> {
  const BATCH_SIZE = 20;
  return batchProcess(stickers, BATCH_SIZE, async (batch) => {
    const transformedBatch = await Promise.all(
      batch.map((sticker) => transformSticker(sticker, options))
    );
    return transformedBatch.filter(
      (sticker): sticker is StickerView => sticker !== null
    );
  });
}

// Clear transform caches periodically
setInterval(() => {
  transformCache.categories = new WeakMap();
  transformCache.creators = new WeakMap();
}, 5 * 60 * 1000); // Clear every 5 minutes
