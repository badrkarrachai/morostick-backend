import mongoose, { Schema } from "mongoose";
import { ISticker } from "../interfaces/sticker_interface";
import { STICKER_REQUIREMENTS } from "../config/app_requirement";

const StatsSchema = new Schema(
  {
    downloads: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    favorites: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const DimensionsSchema = new Schema(
  {
    width: {
      type: Number,
      required: true,
      validate: {
        validator: (width: number) =>
          width >= STICKER_REQUIREMENTS.dimensions.minWidth &&
          width <= STICKER_REQUIREMENTS.dimensions.maxWidth,
        message: `Width must be between ${STICKER_REQUIREMENTS.dimensions.minWidth} and ${STICKER_REQUIREMENTS.dimensions.maxWidth} pixels`,
      },
    },
    height: {
      type: Number,
      required: true,
      validate: {
        validator: (height: number) =>
          height >= STICKER_REQUIREMENTS.dimensions.minHeight &&
          height <= STICKER_REQUIREMENTS.dimensions.maxHeight,
        message: `Height must be between ${STICKER_REQUIREMENTS.dimensions.minHeight} and ${STICKER_REQUIREMENTS.dimensions.maxHeight} pixels`,
      },
    },
  },
  { _id: false }
);

const StickerSchema = new Schema<ISticker>(
  {
    packId: {
      type: Schema.Types.ObjectId,
      ref: "StickerPack",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: STICKER_REQUIREMENTS.nameMaxLength,
    },
    emojis: {
      type: [String],
      default: [],
      validate: {
        validator: (emojis: string[]) =>
          emojis.length <= STICKER_REQUIREMENTS.maxEmojis,
        message: `Maximum ${STICKER_REQUIREMENTS.maxEmojis} emojis allowed per sticker`,
      },
    },
    thumbnailUrl: {
      type: String,
      required: true,
      trim: true,
    },
    webpUrl: {
      type: String,
      required: true,
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (tags: string[]) =>
          tags.length <= STICKER_REQUIREMENTS.maxTags,
        message: `Maximum ${STICKER_REQUIREMENTS.maxTags} tags allowed per sticker`,
      },
    },
    isAnimated: {
      type: Boolean,
      required: true,
      default: false,
    },
    fileSize: {
      type: Number,
      required: true,
      validate: {
        validator: function (size: number) {
          return this.isAnimated
            ? size <= STICKER_REQUIREMENTS.animatedMaxFileSize
            : size <= STICKER_REQUIREMENTS.maxFileSize;
        },
        message: (props: any) => {
          const maxSize = props.value.isAnimated
            ? STICKER_REQUIREMENTS.animatedMaxFileSize
            : STICKER_REQUIREMENTS.maxFileSize;
          return `File size exceeds maximum allowed limit of ${maxSize} bytes`;
        },
      },
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dimensions: {
      type: DimensionsSchema,
      required: true,
    },
    format: {
      type: String,
      enum: {
        values: ["webp", "png"] as const,
        message: "Format must be either webp or png",
      },
      required: true,
    },
    categories: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      validate: {
        validator: function (categories: mongoose.Types.ObjectId[]) {
          return categories.length <= STICKER_REQUIREMENTS.maxCategories;
        },
        message: `Maximum ${STICKER_REQUIREMENTS.maxCategories} categories allowed per sticker`,
      },
      default: [],
      index: true,
    },
    position: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    stats: {
      type: StatsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
StickerSchema.index({ packId: 1, position: 1 });
StickerSchema.index({ packId: 1, name: 1 }, { unique: true });
StickerSchema.index({ packId: 1, createdAt: -1 });
StickerSchema.index({ tags: 1 });
StickerSchema.index(
  { name: "text", tags: "text" },
  { weights: { name: 10, tags: 5 } }
);

// Pre-save hooks
StickerSchema.pre("save", async function (next) {
  if (this.isModified("isAnimated") && !this.isNew) {
    throw new Error("Cannot change animation type after creation");
  }
  next();
});

// Virtual for pack info
StickerSchema.virtual("pack", {
  ref: "StickerPack",
  localField: "packId",
  foreignField: "_id",
  justOne: true,
});

// Methods
StickerSchema.methods.incrementStats = async function (
  field: keyof typeof StatsSchema.obj
) {
  if (field in this.stats) {
    this.stats[field]++;
    await this.save();
  }
};

// Static methods
StickerSchema.statics.findByTags = async function (tags: string[]) {
  return this.find({ tags: { $in: tags } })
    .sort({ "stats.downloads": -1 })
    .populate("creator", "username avatarUrl");
};

StickerSchema.statics.findPopular = async function (limit = 20) {
  return this.find({})
    .sort({ "stats.downloads": -1 })
    .limit(limit)
    .populate("creator", "username avatarUrl");
};

export const Sticker = mongoose.model<ISticker>("Sticker", StickerSchema);
