import { Document, Types } from "mongoose";

// Sticker-specific constants
export const GENERAL_REQUIREMENTS = {
  maxFileSize: 5 * 1024 * 1024, // 5MB for static files
  animatedMaxFileSize: 10 * 1024 * 1024, // 10MB for animated files
  dimensions: {
    maxWidth: 2048,
    maxHeight: 2048,
    minWidth: 100,
    minHeight: 100,
  },
  allowedFormats: ["webp", "png", "jpeg", "jpg", "gif"],
};

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
