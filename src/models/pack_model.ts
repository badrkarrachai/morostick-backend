import mongoose, { Schema, PopulatedDoc, Types } from "mongoose";
import {
  IStickerPack,
  IStickerPackMethods,
  IStickerPackModel,
} from "../interfaces/pack_interface";
import { ISticker } from "../interfaces/sticker_interface";
import { PACK_REQUIREMENTS } from "../config/app_requirement";
import User from "./users_model";

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
  stickerId: mongoose.Types.ObjectId,
  userId: String
): Promise<void> {
  if (this.stickers.length >= PACK_REQUIREMENTS.maxStickers) {
    throw new Error(
      `Pack cannot contain more than ${PACK_REQUIREMENTS.maxStickers} stickers`
    );
  }

  // Get current position
  const position = this.stickers.length;

  // Update the sticker's position
  await mongoose
    .model<ISticker>("Sticker")
    .findByIdAndUpdate(stickerId, { position: position });

  this.stickers.push(stickerId);

  // Update the user's stickers and packs
  await User.findByIdAndUpdate(userId, {
    $push: {
      stickers: stickerId,
    },
  });
  await this.save();
};

// Also add this method to help maintain positions when removing stickers
StickerPackSchema.methods.removeSticker = async function (
  stickerId: mongoose.Types.ObjectId,
  userId: String
): Promise<void> {
  const sticker = await mongoose.model<ISticker>("Sticker").findById(stickerId);
  if (!sticker) return;

  const removedPosition = sticker.position;

  // Remove sticker from pack
  this.stickers = this.stickers.filter((id) => !id.equals(stickerId));

  // Update positions of remaining stickers
  await mongoose.model<ISticker>("Sticker").updateMany(
    {
      packId: this._id,
      position: { $gt: removedPosition },
    },
    { $inc: { position: -1 } }
  );

  // Update the user's stickers and packs
  await User.findByIdAndUpdate(userId, {
    $pull: {
      stickers: stickerId,
    },
  });

  await this.save();
};

StickerPackSchema.methods.reorderStickers = async function (
  stickerIds: Types.ObjectId[]
): Promise<void> {
  // Verify all stickers exist in the pack
  const invalidStickers = stickerIds.filter(
    (id) => !this.stickers.some((existingId) => existingId.equals(id))
  );

  if (invalidStickers.length > 0) {
    throw new Error("Some stickers do not belong to this pack");
  }

  // Verify we have all stickers from the pack
  if (stickerIds.length !== this.stickers.length) {
    throw new Error("Must provide all stickers in the pack for reordering");
  }

  // Update positions in database
  const bulkOps = stickerIds.map((stickerId, index) => ({
    updateOne: {
      filter: { _id: stickerId, packId: this._id },
      update: { $set: { position: index } },
    },
  }));

  await mongoose.model<ISticker>("Sticker").bulkWrite(bulkOps);

  // Update stickers array in pack
  this.stickers = stickerIds;
  await this.save();
};

// Move single sticker to new position
StickerPackSchema.methods.moveSticker = async function (
  stickerId: Types.ObjectId,
  newPosition: number
): Promise<void> {
  // Verify sticker exists in pack
  const stickerIndex = this.stickers.findIndex((id) => id.equals(stickerId));
  if (stickerIndex === -1) {
    throw new Error("Sticker does not belong to this pack");
  }

  // Verify position is valid
  if (newPosition < 0 || newPosition >= this.stickers.length) {
    throw new Error("Invalid position");
  }

  // Remove sticker from current position and insert at new position
  const stickers = [...this.stickers];
  stickers.splice(stickerIndex, 1);
  stickers.splice(newPosition, 0, stickerId);

  // Use reorderStickers to update all positions
  await this.reorderStickers(stickers);
};

// Pre-save hook to ensure stickers are ordered by position when populating
StickerPackSchema.pre("find", function () {
  this.populate({
    path: "stickers",
    options: { sort: { position: 1 } },
  });
});

// Create and export the model
export const StickerPack = mongoose.model<IStickerPack, IStickerPackModel>(
  "StickerPack",
  StickerPackSchema
);
