import mongoose, { Schema } from "mongoose";
import {
  IBasePack,
  IPackModel,
  IPackMethods,
} from "../interfaces/pack_interface";
import { ISticker } from "../interfaces/sticker_interface";
import { PACK_REQUIREMENTS } from "../config/app_requirement";

const StatsSchema = new Schema(
  {
    downloads: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    favorites: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const PackSchema = new Schema<IBasePack, IPackModel>(
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
    creator: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
    ],
    stickers: [
      {
        type: Schema.Types.ObjectId,
        ref: "Sticker",
      },
    ],
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
    categories: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true,
        index: true,
      },
    ],
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

// Array validations
PackSchema.path("stickers").validate(function (
  stickers: mongoose.Types.ObjectId[]
) {
  return stickers.length <= PACK_REQUIREMENTS.maxStickers;
},
`Pack cannot contain more than ${PACK_REQUIREMENTS.maxStickers} stickers`);

PackSchema.path("categories").validate(function (
  categories: mongoose.Types.ObjectId[]
) {
  return categories.length <= PACK_REQUIREMENTS.maxCategories;
},
`Pack cannot have more than ${PACK_REQUIREMENTS.maxCategories} categories`);

// Instance methods
const methods: IPackMethods = {
  async addSticker(stickerId: mongoose.Types.ObjectId): Promise<void> {
    if (this.stickers.length >= PACK_REQUIREMENTS.maxStickers) {
      throw new Error(
        `Pack cannot contain more than ${PACK_REQUIREMENTS.maxStickers} stickers`
      );
    }

    const position = this.stickers.length;

    await mongoose.model<ISticker>("Sticker").findByIdAndUpdate(stickerId, {
      position: position,
      packId: this._id,
    });

    this.stickers.push(stickerId);
    await this.save();
  },

  async removeSticker(stickerId: mongoose.Types.ObjectId): Promise<void> {
    const sticker = await mongoose
      .model<ISticker>("Sticker")
      .findById(stickerId);
    if (!sticker) return;

    const removedPosition = sticker.position;

    this.stickers = this.stickers.filter((id) => !id.equals(stickerId));

    await mongoose.model<ISticker>("Sticker").updateMany(
      {
        packId: this._id,
        position: { $gt: removedPosition },
      },
      { $inc: { position: -1 } }
    );

    await mongoose.model<ISticker>("Sticker").findByIdAndUpdate(stickerId, {
      $unset: { packId: "", position: "" },
    });

    await this.save();
  },

  async reorderStickers(stickerIds: mongoose.Types.ObjectId[]): Promise<void> {
    const invalidStickers = stickerIds.filter(
      (id) => !this.stickers.some((existingId) => existingId.equals(id))
    );

    if (invalidStickers.length > 0) {
      throw new Error("Some stickers do not belong to this pack");
    }

    if (stickerIds.length !== this.stickers.length) {
      throw new Error("Must provide all stickers in the pack for reordering");
    }

    const bulkOps = stickerIds.map((stickerId, index) => ({
      updateOne: {
        filter: { _id: stickerId, packId: this._id },
        update: { $set: { position: index } },
      },
    }));

    await mongoose.model<ISticker>("Sticker").bulkWrite(bulkOps);
    this.stickers = stickerIds;
    await this.save();
  },

  async moveSticker(
    stickerId: mongoose.Types.ObjectId,
    newPosition: number
  ): Promise<void> {
    const stickerIndex = this.stickers.findIndex((id) => id.equals(stickerId));
    if (stickerIndex === -1) {
      throw new Error("Sticker does not belong to this pack");
    }

    if (newPosition < 0 || newPosition >= this.stickers.length) {
      throw new Error("Invalid position");
    }

    const stickers = [...this.stickers];
    stickers.splice(stickerIndex, 1);
    stickers.splice(newPosition, 0, stickerId);

    await this.reorderStickers(stickers);
  },
};

// Add methods to schema
Object.assign(PackSchema.methods, methods);

// Pre-save hooks
PackSchema.pre("save", async function (next) {
  if (this.isNew && this.categories.length === 0) {
    throw new Error("Pack must have at least one category");
  }
  next();
});

PackSchema.pre("save", async function (next) {
  if (this.isModified("isAnimatedPack") && this.stickers.length > 0) {
    throw new Error("Cannot change pack type after stickers have been added");
  }
  next();
});

// Virtual for preview stickers
PackSchema.virtual("previewStickers", {
  ref: "Sticker",
  localField: "stickers",
  foreignField: "_id",
  options: {
    limit: PACK_REQUIREMENTS.maxPreviewStickers,
    sort: { position: 1 },
  },
});

export const StickerPack = mongoose.model<IBasePack, IPackModel>(
  "Pack",
  PackSchema
);
