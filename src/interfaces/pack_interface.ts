import { Document, Model, Types } from "mongoose";
import { IStats } from "./sticker_interface";

// Base interface for pack properties
interface IBasicPack {
  name: string;
  description?: string;
  trayIcon?: string;
  creator: Types.ObjectId;
  stickers: Types.ObjectId[];
  isPrivate: boolean;
  isAuthorized: boolean;
  isAnimatedPack: boolean;
  categories: Types.ObjectId[];
  stats: IStats;
  createdAt: Date;
  updatedAt: Date;
}

// Methods interface
export interface IPackMethods {
  addSticker(stickerId: Types.ObjectId): Promise<void>;
  removeSticker(stickerId: Types.ObjectId): Promise<void>;
  reorderStickers(stickerIds: Types.ObjectId[]): Promise<void>;
  moveSticker(stickerId: Types.ObjectId, newPosition: number): Promise<void>;
  recordView(options: { userId?: string }): Promise<boolean>;
  incrementStats(field: keyof IStats): Promise<void>;
  decrementStats(field: keyof IStats): Promise<void>;
}

// Combined interface for document with methods
export interface IBasePack extends IBasicPack, Document, IPackMethods {}

// Model interface
export interface IPackModel extends Model<IBasePack> {
  recordBatchViews(
    packIds: string[],
    options: { userId?: string }
  ): Promise<void>;

  getViewStats(
    packId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<
    {
      date: string;
      views: number;
      uniqueUsers: number;
    }[]
  >;
}
