import mongoose, { Types, Document } from "mongoose";
import { ICategory } from "../../interfaces/category_interface";
import { IBasePack } from "../../interfaces/pack_interface";
import { ISticker } from "../../interfaces/sticker_interface";
import { IUser } from "../../interfaces/user_interface";
import { IImages } from "../../interfaces/image_interface";
import {
  StickerView,
  PackView,
  CategoryView,
  CreatorView,
} from "../../interfaces/views_interface";
import { StickerPack } from "../../models/pack_model";
import { Category } from "../../models/category_model";
import { Sticker } from "../../models/sticker_model";
import { PACK_REQUIREMENTS } from "../../config/app_requirement";

type Lean<T> = mongoose.FlattenMaps<T>;

// Populated document interfaces
interface PopulatedUserAvatar extends Omit<IUser, "avatar"> {
  _id: Types.ObjectId;
  avatar?: Lean<IImages>;
}

interface PopulatedPack extends Omit<IBasePack, "categories" | "creator"> {
  _id: Types.ObjectId;
  categories: Lean<ICategory>[];
  creator: Lean<PopulatedUserAvatar>[];
}

interface PopulatedSticker extends Omit<ISticker, "creator" | "categories"> {
  _id: Types.ObjectId;
  creator: Lean<PopulatedUserAvatar>;
  categories: Lean<ICategory>[];
}

/**
 * Transform a user document into a CreatorView
 */
function transformCreator(user: Lean<PopulatedUserAvatar>): CreatorView {
  return {
    id: user._id.toString(),
    name: user.name,
    avatarUrl: user.avatar?.url || "",
  };
}

/**
 * Transform a category document into a CategoryView
 */
export function transformCategory(category: Lean<ICategory>): CategoryView {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description,
    emoji: category.emoji,
    isActive: category.isActive,
    order: category.order,
    isGenerated: category.isGenerated,
    stats: {
      packCount: category.stats.packCount,
      stickerCount: category.stats.stickerCount,
      totalViews: category.stats.totalViews,
      totalDownloads: category.stats.totalDownloads,
    },
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

/**
 * Transform a pack document into a PackView
 */
export async function transformPack(
  input: string | Types.ObjectId | Document,
  stickersLimit?: number
): Promise<PackView | null> {
  try {
    const populatedPack = await StickerPack.findById(
      input instanceof Document ? input._id : input
    )
      .populate<{ categories: ICategory[] }>("categories")
      .populate({
        path: "creator",
        select: "name avatar",
        populate: {
          path: "avatar",
          model: "Image",
          select: "url",
        },
      })
      .populate({
        path: "stickers",
        options: {
          limit: stickersLimit ?? PACK_REQUIREMENTS.maxPreviewStickers,
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
          {
            path: "categories",
          },
        ],
      })
      .lean<PopulatedPack>();

    if (!populatedPack) return null;

    return {
      id: populatedPack._id.toString(),
      name: populatedPack.name,
      description: populatedPack.description,
      trayIcon: populatedPack.trayIcon,
      creator: populatedPack.creator.map(transformCreator)[0],
      stickers: await transformStickers(populatedPack.stickers),
      isPrivate: populatedPack.isPrivate,
      isAuthorized: populatedPack.isAuthorized,
      isAnimatedPack: populatedPack.isAnimatedPack,
      categories: populatedPack.categories.map(transformCategory),
      stats: populatedPack.stats,
      createdAt: populatedPack.createdAt,
      updatedAt: populatedPack.updatedAt,
    };
  } catch (error) {
    console.error("Error transforming pack:", error);
    return null;
  }
}

/**
 * Transform a sticker document into a StickerView
 */
export async function transformSticker(
  input: string | Types.ObjectId | Document
): Promise<StickerView | null> {
  try {
    const populatedSticker = await Sticker.findById(
      input instanceof Document ? input._id : input
    )
      .populate<{ categories: ICategory[] }>("categories")
      .populate({
        path: "creator",
        select: "name avatar",
        populate: {
          path: "avatar",
          model: "Image",
          select: "url",
        },
      })
      .lean<PopulatedSticker>();

    if (!populatedSticker) return null;

    return {
      id: populatedSticker._id.toString(),
      packId: populatedSticker.packId.toString(),
      name: populatedSticker.name,
      emojis: populatedSticker.emojis,
      thumbnailUrl: populatedSticker.thumbnailUrl,
      webpUrl: populatedSticker.webpUrl,
      isAnimated: populatedSticker.isAnimated,
      fileSize: populatedSticker.fileSize,
      creator: transformCreator(populatedSticker.creator),
      dimensions: populatedSticker.dimensions,
      format: populatedSticker.format,
      categories: populatedSticker.categories.map(transformCategory),
      position: populatedSticker.position,
      stats: populatedSticker.stats,
      createdAt: populatedSticker.createdAt,
      updatedAt: populatedSticker.updatedAt,
    };
  } catch (error) {
    console.error("Error transforming sticker:", error);
    return null;
  }
}

/**
 * Transform arrays of documents
 */
export async function transformPacks(
  packs: (string | Types.ObjectId | Document)[]
): Promise<PackView[]> {
  const transformedPacks = await Promise.all(
    packs.map((pack) => transformPack(pack))
  );
  return transformedPacks.filter((pack): pack is PackView => pack !== null);
}

export async function transformStickers(
  stickers: (string | Types.ObjectId | Document)[]
): Promise<StickerView[]> {
  const transformedStickers = await Promise.all(
    stickers.map((sticker) => transformSticker(sticker))
  );
  return transformedStickers.filter(
    (sticker): sticker is StickerView => sticker !== null
  );
}

export function transformCategories(categories: ICategory[]): CategoryView[] {
  return categories.map(transformCategory);
}
