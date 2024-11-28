// utils/pack_preview_util.ts

import { Types } from "mongoose";
import {
  IPackPreview,
  IStickerPack,
  IStickerPackPreview,
  PACK_REQUIREMENTS,
} from "../../interfaces/pack_interface";
import { ISticker } from "../../interfaces/sticker_interface";

export class PackPreviewFormatter {
  static toStickerPreview(sticker: Partial<ISticker>): IStickerPackPreview {
    return {
      _id: new Types.ObjectId(sticker.id),
      name: sticker.name,
      webpUrl: sticker.webpUrl,
      thumbnailUrl: sticker.thumbnailUrl,
      fileSize: sticker.fileSize,
      dimensions: sticker.dimensions,
      createdAt: new Date(sticker.createdAt),
      updatedAt: new Date(sticker.updatedAt),
    };
  }

  static toPackPreview(
    pack: Partial<IStickerPack> & { previewStickers?: Partial<ISticker>[] }
  ): IPackPreview {
    return {
      _id: new Types.ObjectId(pack.id),
      name: pack.name,
      description: pack.description,
      creator: pack.creator,
      previewStickers: (pack.previewStickers || [])
        .slice(0, PACK_REQUIREMENTS.maxPreviewStickers)
        .map(this.toStickerPreview),
      totalStickers: pack.stickers?.length || 0,
      isAnimatedPack: pack.isAnimatedPack,
      stats: pack.stats,
    };
  }
}
