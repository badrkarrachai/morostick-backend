import mongoose, { Schema, PopulatedDoc, Types } from "mongoose";
import {
  IStickerPack,
  IStickerPackMethods,
  IStickerPackModel,
  IPackPreview,
  PACK_REQUIREMENTS,
} from "../interfaces/pack_interface";
import { ISticker, IStickerPreview } from "../interfaces/sticker_interface";

const StatsSchema = new Schema(
  {
    downloads: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    favorites: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const CreatorSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
    avatarUrl: String,
  },
  { _id: false }
);

const StickerPackSchema = new Schema<
  IStickerPack,
  IStickerPackModel,
  IStickerPackMethods
>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: PACK_REQUIREMENTS.nameMaxLength,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: PACK_REQUIREMENTS.descriptionMaxLength,
    },
    trayIcon: {
      type: String,
      trim: true,
    },
    creator: {
      type: CreatorSchema,
      required: true,
      index: true,
    },
    stickers: [{ type: Schema.Types.ObjectId, ref: "Sticker" }],
    tags: {
      type: [String],
      validate: {
        validator: (tags: string[]) => tags.length <= PACK_REQUIREMENTS.maxTags,
        message: `Maximum ${PACK_REQUIREMENTS.maxTags} tags allowed`,
      },
    },
    isPrivate: {
      type: Boolean,
      default: false,
      index: true,
    },
    isAuthorized: {
      type: Boolean,
      default: false,
      index: true,
    },
    isAnimatedPack: {
      type: Boolean,
      default: false,
      index: true,
    },
    stats: {
      type: StatsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
StickerPackSchema.index({ "creator._id": 1, createdAt: -1 });
StickerPackSchema.index({ tags: 1, isPrivate: 1 });
StickerPackSchema.index({ isPrivate: 1, isAuthorized: 1 });
StickerPackSchema.index(
  { name: "text", "creator.username": "text", tags: "text" },
  { weights: { name: 10, "creator.username": 5, tags: 3 } }
);

// Instance Methods
StickerPackSchema.methods.addSticker = async function (
  stickerId: mongoose.Types.ObjectId
): Promise<void> {
  if (this.stickers.length >= PACK_REQUIREMENTS.maxStickers) {
    throw new Error(
      `Pack cannot contain more than ${PACK_REQUIREMENTS.maxStickers} stickers`
    );
  }

  this.stickers.push(stickerId);
  await this.save();
};

StickerPackSchema.methods.removeSticker = async function (
  stickerId: mongoose.Types.ObjectId
): Promise<void> {
  this.stickers = this.stickers.filter((id) => !id.equals(stickerId));
  await this.save();
};

// Create and export the model
export const StickerPack = mongoose.model<IStickerPack, IStickerPackModel>(
  "StickerPack",
  StickerPackSchema
);
