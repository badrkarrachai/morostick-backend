import mongoose, { Schema } from "mongoose";
import {
  IBasePack,
  IPackModel,
  IPackMethods,
} from "../interfaces/pack_interface";
import { ISticker } from "../interfaces/sticker_interface";
import { PACK_REQUIREMENTS } from "../config/app_requirement";

// View Log Schema (separate collection)
const ViewLogSchema = new Schema(
  {
    packId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      sparse: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timeseries: {
      timeField: "timestamp",
      metaField: "packId",
      granularity: "hours",
    },
  }
);

export const ViewLog = mongoose.model("ViewLog", ViewLogSchema);

// Stats Schema
const StatsSchema = new Schema(
  {
    downloads: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    favorites: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// Main Pack Schema
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
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
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

// Indexes
PackSchema.index({ isPrivate: 1, isAuthorized: 1 });
PackSchema.index({ categories: 1, isPrivate: 1, isAuthorized: 1 });
PackSchema.index({ creator: 1, isPrivate: 1 });
PackSchema.index({ "stats.downloads": -1, isPrivate: 1, isAuthorized: 1 });
PackSchema.index({ "stats.views": -1, isPrivate: 1, isAuthorized: 1 });
PackSchema.index({ "stats.favorites": -1, isPrivate: 1, isAuthorized: 1 });
PackSchema.index({ createdAt: -1, isPrivate: 1, isAuthorized: 1 });
PackSchema.index({ stickers: 1, position: 1 });

// Text index for search
PackSchema.index(
  { name: "text", description: "text" },
  {
    weights: {
      name: 10,
      description: 5,
    },
    default_language: "english",
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

// Extended Methods Interface
interface UpdatedPackMethods extends IPackMethods {
  recordView(options: { userId?: string }): Promise<boolean>;
  incrementStats(field: keyof typeof StatsSchema.obj): Promise<void>;
  decrementStats(field: keyof typeof StatsSchema.obj): Promise<void>;
}

// Combined methods
const methods: UpdatedPackMethods = {
  // Existing sticker methods
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

  // View tracking methods
  async recordView({ userId }: { userId?: string }): Promise<boolean> {
    if (!userId) {
      // If no userId, just increment view without tracking
      await this.incrementStats("views");
      return true;
    }

    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const recentView = await ViewLog.findOne({
      packId: this._id,
      userId: new mongoose.Types.ObjectId(userId),
      timestamp: { $gte: thirtyMinutesAgo },
    }).lean();

    if (recentView) {
      return false;
    }

    await Promise.all([
      ViewLog.create({
        packId: this._id,
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: now,
      }),
      this.model("Pack").updateOne(
        { _id: this._id },
        { $inc: { "stats.views": 1 } }
      ),
    ]);

    return true;
  },

  async incrementStats(field: keyof typeof StatsSchema.obj): Promise<void> {
    const update = { $inc: {} };
    update.$inc[`stats.${field}`] = 1;
    await this.model("Pack").updateOne({ _id: this._id }, update);
  },

  async decrementStats(field: keyof typeof StatsSchema.obj): Promise<void> {
    const update = { $inc: {} };
    update.$inc[`stats.${field}`] = -1;

    // Ensure we don't go below 0
    const options = {
      new: true, // Return the modified document
      runValidators: true, // Run schema validators
    };

    await this.model("Pack").findOneAndUpdate(
      {
        _id: this._id,
        [`stats.${field}`]: { $gt: 0 }, // Only decrement if current value > 0
      },
      update,
      options
    );
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

// Static methods for analytics
PackSchema.statics.getViewStats = async function (
  packId: string,
  timeRange: {
    start: Date;
    end: Date;
  }
): Promise<
  {
    date: string;
    views: number;
    uniqueUsers: number;
  }[]
> {
  return ViewLog.aggregate([
    {
      $match: {
        packId: new mongoose.Types.ObjectId(packId),
        timestamp: { $gte: timeRange.start, $lte: timeRange.end },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
        },
        views: { $sum: 1 },
        uniqueUsers: {
          $addToSet: "$userId",
        },
      },
    },
    {
      $project: {
        date: "$_id",
        views: 1,
        uniqueUsers: { $size: "$uniqueUsers" },
        _id: 0,
      },
    },
    { $sort: { date: 1 } },
  ]);
};

// Add this static method to your pack model
PackSchema.statics.recordBatchViews = async function (
  packIds: string[],
  options: { userId?: string }
): Promise<void> {
  if (!packIds.length) return;

  // For anonymous users, just increment views
  if (!options.userId) {
    await this.updateMany(
      { _id: { $in: packIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      { $inc: { "stats.views": 1 } }
    );
    return;
  }

  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  // Get recently viewed packs for this user
  const recentViews = await ViewLog.distinct("packId", {
    packId: { $in: packIds.map((id) => new mongoose.Types.ObjectId(id)) },
    userId: new mongoose.Types.ObjectId(options.userId),
    timestamp: { $gte: thirtyMinutesAgo },
  });

  // Filter out recently viewed packs
  const packsToUpdate = packIds.filter(
    (id) => !recentViews.some((recentId) => recentId.equals(id))
  );

  if (!packsToUpdate.length) return;

  await Promise.all([
    ViewLog.insertMany(
      packsToUpdate.map((packId) => ({
        packId: new mongoose.Types.ObjectId(packId),
        userId: new mongoose.Types.ObjectId(options.userId),
        timestamp: now,
      }))
    ),
    this.updateMany(
      {
        _id: {
          $in: packsToUpdate.map((id) => new mongoose.Types.ObjectId(id)),
        },
      },
      { $inc: { "stats.views": 1 } }
    ),
  ]);
};

export const StickerPack = mongoose.model<IBasePack, IPackModel>(
  "Pack",
  PackSchema
);
