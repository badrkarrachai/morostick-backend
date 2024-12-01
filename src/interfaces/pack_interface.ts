import { Document, Model, Types } from "mongoose";
import { ICreator, IStats } from "./sticker_interface";

export interface IBasePack {
  name: string;
  description?: string;
  trayIcon?: string;
  creator: ICreator;
  stickers: Types.ObjectId[];
  isPrivate: boolean;
  isAuthorized: boolean;
  isAnimatedPack: boolean;
  stats: IStats;
  createdAt: Date;
  updatedAt: Date;
}

// Sticker interface
export interface IStickerPackPreview {
  _id: Types.ObjectId;
  name: string;
  webpUrl: string;
  thumbnailUrl: string;
  fileSize: number;
  dimensions: {
    width: number;
    height: number;
  };
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

// Document interface
export interface IStickerPack extends IBasePack, Document {}

// Preview interface
export interface IPackPreview {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  creator: ICreator;
  previewStickers: IStickerPackPreview[];
  totalStickers: number;
  isAnimatedPack: boolean;
  stats: IStats;
}

// DTO interfaces
export interface AddStickerDTO {
  name: string;
  thumbnailUrl: string;
  webpUrl: string;
  file: Express.Multer.File;
}

export interface StickerValidationResult {
  isValid: boolean;
  errors?: string[];
}

// Pack methods
export interface IStickerPackMethods {
  addSticker(stickerId: Types.ObjectId, userId: String): Promise<void>;
  removeSticker(stickerId: Types.ObjectId, userId: String): Promise<void>;
  reorderStickers(stickerIds: Types.ObjectId[]): Promise<void>;
  moveSticker(stickerId: Types.ObjectId, newPosition: number): Promise<void>;
}

// Model interface
export interface IStickerPackModel
  extends Model<IStickerPack, {}, IStickerPackMethods> {
  findPopular(limit?: number): Promise<IPackPreview[]>;
  findRecent(limit?: number): Promise<IPackPreview[]>;
  validateSticker(sticker: AddStickerDTO): StickerValidationResult;
  validateFile(file: Express.Multer.File): StickerValidationResult;
}
