import { Document, Model, Types } from "mongoose";
import { ICreator, IStats } from "./sticker_interface";

// Constants
export const PACK_REQUIREMENTS = {
  maxStickers: 30,
  maxPreviewStickers: 5,
  nameMaxLength: 32,
  descriptionMaxLength: 512,
  maxTags: 10,
};

export interface IBasePack {
  name: string;
  description?: string;
  trayIcon?: string;
  creator: ICreator;
  stickers: Types.ObjectId[];
  tags: string[];
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
  addSticker(stickerId: Types.ObjectId): Promise<void>;
  removeSticker(stickerId: Types.ObjectId): Promise<void>;
  toPreviewJSON(): IPackPreview;
}

// Model interface
export interface IStickerPackModel
  extends Model<IStickerPack, {}, IStickerPackMethods> {
  findPopular(limit?: number): Promise<IPackPreview[]>;
  findRecent(limit?: number): Promise<IPackPreview[]>;
  validateSticker(sticker: AddStickerDTO): StickerValidationResult;
  validateFile(file: Express.Multer.File): StickerValidationResult;
}
