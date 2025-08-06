import mongoose, { Schema, Model, Types } from "mongoose";
import { ICategory } from "../interfaces/category_interface";

// utility function for name formatting
const formatCategoryName = (name: string): string => {
  // Convert the name to lowercase first
  const lowercased = name.toLowerCase().trim();
  // Capitalize the first letter
  return lowercased.charAt(0).toUpperCase() + lowercased.slice(1);
};

// Define interface for static methods
interface ICategoryModel extends Model<ICategory> {
  findOrCreate(name: string, isGenerated?: boolean): Promise<ICategory>;
  reorderCategory(categoryId: string, newOrder: number): Promise<void>;
  normalizeOrders(): Promise<void>;
  findPopular(limit?: number): Promise<ICategory[]>;
  assignCategories(options: { categoryIds?: string[]; categoryNames?: string[]; fallbackName?: string }): Promise<Types.ObjectId[]>;
}

const CategoryStatsSchema = new Schema(
  {
    packCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    stickerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalViews: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDownloads: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSearches: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const CategorySchema = new Schema<ICategory, ICategoryModel>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 50,
      set: formatCategoryName,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    emoji: {
      type: [String],
      default: [],
      validate: {
        validator: function (emojis: string[]) {
          return Array.isArray(emojis) && emojis.every((emoji) => /\p{Emoji}/u.test(emoji));
        },
        message: "Invalid emoji format",
      },
    },
    trayIcon: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    isGenerated: {
      type: Boolean,
      default: false,
    },
    stats: {
      type: CategoryStatsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes
CategorySchema.index({ order: 1, isActive: 1 });
CategorySchema.index({ "stats.packCount": -1 });
CategorySchema.index({ "stats.stickerCount": -1 });
CategorySchema.index({ slug: 1 });
CategorySchema.index({ name: "text" });

// Methods for updating stats
CategorySchema.methods.incrementStats = async function (stats: {
  packCount?: number;
  stickerCount?: number;
  views?: number;
  downloads?: number;
}): Promise<void> {
  const update: any = {};

  if (stats.packCount) update["stats.packCount"] = stats.packCount;
  if (stats.stickerCount) update["stats.stickerCount"] = stats.stickerCount;
  if (stats.views) update["stats.totalViews"] = stats.views;
  if (stats.downloads) update["stats.totalDownloads"] = stats.downloads;

  await this.updateOne({ $inc: update });
};

CategorySchema.static(
  "assignCategories",
  async function (options: { categoryIds?: string[]; categoryNames?: string[]; fallbackName?: string }): Promise<Types.ObjectId[]> {
    const { categoryIds = [], categoryNames = [], fallbackName } = options;
    let resultCategories: Types.ObjectId[] = [];

    try {
      // Priority 1: Handle category IDs if provided
      if (categoryIds.length > 0) {
        const existingCategories = await this.find({
          _id: { $in: categoryIds.map((id) => new Types.ObjectId(id)) },
          isActive: true,
        });

        if (existingCategories.length > 0) {
          resultCategories = existingCategories.map((cat) => cat.id);
        }
      }

      // Priority 2: Handle category names if provided
      if (categoryNames.length > 0 && resultCategories.length === 0) {
        const categoryPromises = categoryNames.map((name) => this.findOrCreate(name.trim(), false));
        const createdCategories = await Promise.all(categoryPromises);
        resultCategories = createdCategories.map((cat) => cat.id);
      }

      // Priority 3: Use fallback name if no categories were found/created
      if (resultCategories.length === 0 && fallbackName) {
        const fallbackCategory = await this.findOrCreate(fallbackName.trim(), true);
        resultCategories = [fallbackCategory.id];
      }

      if (resultCategories.length === 0) {
        throw new Error("No valid categories could be assigned");
      }

      return resultCategories;
    } catch (error) {
      throw error;
    }
  }
);

// Pre-save hooks
CategorySchema.pre("save", function (next) {
  // Generate slug from name if not provided
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

CategorySchema.pre("save", function (next) {
  // Ensure stats are never negative
  if (this.isModified("stats")) {
    const stats = this.stats;
    if (stats.packCount < 0) stats.packCount = 0;
    if (stats.stickerCount < 0) stats.stickerCount = 0;
    if (stats.totalViews < 0) stats.totalViews = 0;
    if (stats.totalDownloads < 0) stats.totalDownloads = 0;
  }
  next();
});

// Static methods
CategorySchema.static("findOrCreate", async function (name: string, isGenerated = false): Promise<ICategory> {
  const formattedName = formatCategoryName(name);
  const slug = formattedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  let category = await this.findOne({ slug });

  if (!category) {
    const lastCategory = await this.findOne({}).sort({ order: -1 }).select("order");

    const order = (lastCategory?.order ?? -1) + 1;

    category = await this.create({
      name: formattedName, // Use formatted name
      slug,
      order,
      isGenerated,
    });
  }

  return category;
});

CategorySchema.static("reorderCategory", async function (categoryId: string, newOrder: number): Promise<void> {
  const category = await this.findById(categoryId);
  if (!category) {
    throw new Error("Category not found");
  }

  const oldOrder = category.order;

  if (newOrder > oldOrder) {
    await this.updateMany({ order: { $gt: oldOrder, $lte: newOrder } }, { $inc: { order: -1 } });
  } else if (newOrder < oldOrder) {
    await this.updateMany({ order: { $gte: newOrder, $lt: oldOrder } }, { $inc: { order: 1 } });
  }

  category.order = newOrder;
  await category.save();
});

CategorySchema.static("normalizeOrders", async function (): Promise<void> {
  const categories = await this.find({}).sort({ order: 1 }).select("_id");

  for (let i = 0; i < categories.length; i++) {
    await this.findByIdAndUpdate(categories[i]._id, { order: i });
  }
});

CategorySchema.static("findPopular", async function (limit = 10): Promise<ICategory[]> {
  return this.find({ isActive: true }).sort({ "stats.packCount": -1 }).limit(limit);
});

export const Category = mongoose.model<ICategory, ICategoryModel>("Category", CategorySchema);
