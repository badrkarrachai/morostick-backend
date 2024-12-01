import { Types } from "mongoose";
import {
  IPackPreview,
  IStickerPack,
  IStickerPackPreview,
} from "../../interfaces/pack_interface";
import { ISticker } from "../../interfaces/sticker_interface";
import { PACK_REQUIREMENTS } from "../../config/app_requirement";

export class PackPreviewFormatter {
  static toStickerPreview(sticker: Partial<ISticker>): IStickerPackPreview {
    return {
      _id: sticker._id as Types.ObjectId, // Use the existing _id directly
      name: sticker.name,
      webpUrl: sticker.webpUrl,
      thumbnailUrl: sticker.thumbnailUrl,
      fileSize: sticker.fileSize,
      dimensions: sticker.dimensions,
      position: sticker.position,
      createdAt: new Date(sticker.createdAt),
      updatedAt: new Date(sticker.updatedAt),
    };
  }

  static toPackPreview(
    pack: Partial<IStickerPack> & { previewStickers?: Partial<ISticker>[] }
  ): IPackPreview {
    const sortedPreviewStickers = (pack.previewStickers || [])
      .slice(0, PACK_REQUIREMENTS.maxPreviewStickers)
      .sort((a, b) => {
        const posA = typeof a.position === "number" ? a.position : 0;
        const posB = typeof b.position === "number" ? b.position : 0;
        return posA - posB;
      });

    return {
      _id: pack._id as Types.ObjectId, // Use the existing _id directly
      name: pack.name,
      description: pack.description,
      creator: pack.creator,
      previewStickers: sortedPreviewStickers.map(this.toStickerPreview),
      totalStickers: pack.stickers?.length || 0,
      isAnimatedPack: pack.isAnimatedPack,
      stats: pack.stats,
    };
  }
}
