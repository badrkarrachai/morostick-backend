import mongoose, { Schema } from "mongoose";
import { ISticker } from "../interfaces/sticker_interface";
import { STICKER_REQUIREMENTS } from "../config/app_requirement";

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
      maxlength: 128,
    },
    emojis: {
      type: [String],
      validate: {
        validator: (emojis: string[]) =>
          emojis.length <= STICKER_REQUIREMENTS.maxEmojis,
        message: `Maximum ${STICKER_REQUIREMENTS.maxEmojis} emojis allowed per sticker`,
      },
    },
    thumbnailUrl: {
      type: String,
      required: true,
    },
    webpUrl: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
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
        message: "File size exceeds maximum allowed limit",
      },
    },
    dimensions: {
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
    format: {
      type: String,
      enum: {
        values: STICKER_REQUIREMENTS.allowedFormats,
        message: `Format must be one of: ${STICKER_REQUIREMENTS.allowedFormats.join(
          ", "
        )}`,
      },
      required: true,
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
StickerSchema.index({ packId: 1, createdAt: -1 });
StickerSchema.index({ packId: 1, name: 1 }, { unique: true });

// Export the model
export const Sticker = mongoose.model<ISticker>("Sticker", StickerSchema);
