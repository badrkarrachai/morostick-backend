import { Document, Types } from "mongoose";

// ISticker perview interface
export interface IStickerPreview {
  _id: Types.ObjectId;
  name: string;
  creator: ICreator;
  webpUrl: string;
  thumbnailUrl: string;
  isAnimated: boolean;
  fileSize: number;
  dimensions: {
    width: number;
    height: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Basic interfaces
export interface ICreator {
  _id: Types.ObjectId;
  username: string;
  avatarUrl?: string;
}

export interface IStats {
  downloads: number;
  views: number;
  favorites: number;
}

// Single sticker information
export interface ISticker extends Document {
  packId: Types.ObjectId;
  name: string;
  emojis: string[];
  thumbnailUrl: string;
  webpUrl: string;
  tags: string[];
  isAnimated: boolean;
  fileSize: number;
  dimensions: {
    width: number;
    height: number;
  };
  format: "webp" | "png";
  createdAt: Date;
  updatedAt: Date;
}
