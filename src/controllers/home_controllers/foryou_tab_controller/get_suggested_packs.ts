import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";
import { IBasePack } from "../../../interfaces/pack_interface";
import { ISticker } from "../../../interfaces/sticker_interface";

// Simple LRU cache with a fixed size
class SimpleCache {
  private cache = new Map<string, any>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): any {
    const value = this.cache.get(key);
    if (value) {
      // Refresh item position
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: any): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const userPreferencesCache = new SimpleCache(1000);

interface UserPreferences {
  favoriteCategories: Types.ObjectId[];
  likedCreators: Types.ObjectId[];
  prefersAnimated: boolean;
}

async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const cached = userPreferencesCache.get(userId);
  if (cached) return cached;

  // Get user's pack interactions in a single query
  const user = await User.findById(userId)
    .select("packs favoritesPacks")
    .populate([
      {
        path: "packs",
        select: "categories creator isAnimatedPack",
      },
      {
        path: "favoritesPacks",
        select: "categories creator isAnimatedPack",
      },
    ])
    .lean();

  if (!user) throw new Error("User not found");

  // Count category and creator frequencies
  const categoryFreq = new Map<string, number>();
  const creatorFreq = new Map<string, number>();
  let animatedCount = 0;
  let totalPacks = 0;

  // Process user's created and favorite packs
  const processPacks = (packs: any[], weight: number) => {
    for (const pack of packs || []) {
      // Track animation preference
      if (pack.isAnimatedPack) animatedCount += weight;
      totalPacks += weight;

      // Track categories
      pack.categories?.forEach((catId: Types.ObjectId) => {
        const catKey = catId.toString();
        categoryFreq.set(catKey, (categoryFreq.get(catKey) || 0) + weight);
      });

      // Track creators
      if (pack.creator) {
        const creatorKey = pack.creator.toString();
        creatorFreq.set(
          creatorKey,
          (creatorFreq.get(creatorKey) || 0) + weight
        );
      }
    }
  };

  // Weight: 2 for created packs, 1 for favorites
  processPacks(user.packs, 2);
  processPacks(user.favoritesPacks, 1);

  // Get top categories and creators
  const topCategories = [...categoryFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => new Types.ObjectId(id));

  const topCreators = [...creatorFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => new Types.ObjectId(id));

  const preferences = {
    favoriteCategories: topCategories,
    likedCreators: topCreators,
    prefersAnimated: animatedCount > totalPacks / 2,
  };

  userPreferencesCache.set(userId, preferences);
  return preferences;
}

export async function getSuggestedPacks(
  page: number,
  limit: number,
  userId?: string,
  excludePackIds: string[] = []
): Promise<{ packs: PackView[]; total: number }> {
  // Basic match conditions
  const matchStage: Record<string, any> = {
    isPrivate: false,
    isAuthorized: true,
  };

  // Add excluded packs
  if (excludePackIds.length) {
    matchStage._id = {
      $nin: excludePackIds.map((id) => new Types.ObjectId(id)),
    };
  }

  // If no user ID, return trending packs
  if (!userId) {
    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$stats.downloads", 0.5] },
              { $multiply: ["$stats.favorites", 0.3] },
              { $multiply: ["$stats.views", 0.2] },
            ],
          },
        },
      },
      { $sort: { score: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { score: 0 } },
    ];

    const [packs, total] = await Promise.all([
      StickerPack.aggregate(pipeline),
      StickerPack.countDocuments(matchStage),
    ]);

    return {
      packs: await transformPacks(packs),
      total,
    };
  }

  // Get user preferences
  const prefs = await getUserPreferences(userId);

  // Exclude user's own packs
  matchStage.creator = { $ne: new Types.ObjectId(userId) };

  // Build scoring pipeline
  const pipeline: PipelineStage[] = [
    { $match: matchStage },
    {
      $addFields: {
        relevanceScore: {
          $add: [
            // Category match bonus
            {
              $multiply: [
                {
                  $size: {
                    $setIntersection: ["$categories", prefs.favoriteCategories],
                  },
                },
                100,
              ],
            },
            // Creator match bonus
            {
              $cond: {
                if: { $in: ["$creator", prefs.likedCreators] },
                then: 50,
                else: 0,
              },
            },
            // Animation preference match
            {
              $cond: {
                if: { $eq: ["$isAnimatedPack", prefs.prefersAnimated] },
                then: 30,
                else: 0,
              },
            },
            // Engagement score
            {
              $add: [
                { $multiply: ["$stats.downloads", 0.3] },
                { $multiply: ["$stats.favorites", 0.2] },
                { $multiply: ["$stats.views", 0.1] },
              ],
            },
          ],
        },
      },
    },
    { $sort: { relevanceScore: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $project: { relevanceScore: 0 } },
  ];

  const [packs, total] = await Promise.all([
    StickerPack.aggregate(pipeline),
    StickerPack.countDocuments(matchStage),
  ]);

  return {
    packs: await transformPacks(packs),
    total,
  };
}
