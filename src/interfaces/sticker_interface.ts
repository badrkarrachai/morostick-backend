import { Document, Types } from "mongoose";

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
  creator: Types.ObjectId;
  dimensions: {
    width: number;
    height: number;
  };
  format: "webp" | "png";
  categories: Types.ObjectId[];
  position: number;
  stats: IStats;
  createdAt: Date;
  updatedAt: Date;

  // Add method signatures
  incrementStats(field: keyof IStats): Promise<void>;
  decrementStats(field: keyof IStats): Promise<void>;
}
