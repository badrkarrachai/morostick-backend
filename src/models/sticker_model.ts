import mongoose, { Schema } from "mongoose";
import {
  ISticker,
  GENERAL_REQUIREMENTS,
} from "../interfaces/sticker_interface";

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
        validator: (emojis: string[]) => emojis.length <= 3,
        message: "Maximum 3 emojis allowed per sticker",
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
            ? size <= GENERAL_REQUIREMENTS.animatedMaxFileSize
            : size <= GENERAL_REQUIREMENTS.maxFileSize;
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
            width >= GENERAL_REQUIREMENTS.dimensions.minWidth &&
            width <= GENERAL_REQUIREMENTS.dimensions.maxWidth,
          message: `Width must be between ${GENERAL_REQUIREMENTS.dimensions.minWidth} and ${GENERAL_REQUIREMENTS.dimensions.maxWidth} pixels`,
        },
      },
      height: {
        type: Number,
        required: true,
        validate: {
          validator: (height: number) =>
            height >= GENERAL_REQUIREMENTS.dimensions.minHeight &&
            height <= GENERAL_REQUIREMENTS.dimensions.maxHeight,
          message: `Height must be between ${GENERAL_REQUIREMENTS.dimensions.minHeight} and ${GENERAL_REQUIREMENTS.dimensions.maxHeight} pixels`,
        },
      },
    },
    format: {
      type: String,
      enum: {
        values: GENERAL_REQUIREMENTS.allowedFormats,
        message: `Format must be one of: ${GENERAL_REQUIREMENTS.allowedFormats.join(
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
