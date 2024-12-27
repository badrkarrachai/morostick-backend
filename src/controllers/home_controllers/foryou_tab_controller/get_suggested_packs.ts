import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";
import { IBasePack } from "../../../interfaces/pack_interface";
import { ISticker } from "../../../interfaces/sticker_interface";

// Cache interface
interface UserInterestsCache {
  interests: UserInterests;
  timestamp: number;
}

// Cache map with 15-minute expiration
const userInterestsCache = new Map<string, UserInterestsCache>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

interface UserInterests {
  preferredCategories: Types.ObjectId[];
  creatorNetwork: string[]; // Store as strings to avoid unnecessary conversions
  nameSimilarities: string[];
  animatedPreference: boolean;
  engagementScore: Record<string, number>;
}

interface PopulatedUserDocument {
  packs: IBasePack[];
  favoritesPacks: IBasePack[];
  stickers: ISticker[];
  favoritesStickers: ISticker[];
}

async function getUserInterests(userId: string): Promise<UserInterests> {
  // Check cache first
  const cached = userInterestsCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.interests;
  }

  // Optimized single query with specific field selection and population
  const user = await User.findById(userId)
    .select("packs favoritesPacks stickers favoritesStickers")
    .populate([
      {
        path: "packs",
        select: "name categories isAnimatedPack creator -_id",
        model: "Pack",
      },
      {
        path: "favoritesPacks",
        select: "name categories isAnimatedPack creator -_id",
        model: "Pack",
      },
      {
        path: "stickers",
        select: "categories isAnimated -_id",
        model: "Sticker",
      },
      {
        path: "favoritesStickers",
        select: "categories isAnimated -_id",
        model: "Sticker",
      },
    ])
    .lean<PopulatedUserDocument>(); // Use lean() for better performance when we don't need mongoose documents

  if (!user) {
    throw new Error("User not found");
  }

  // Initialize accumulators
  const categoryEngagement: Record<string, number> = {};
  const creatorSet = new Set<string>();
  const nameTokens = new Set<string>();
  let animatedCount = 0;
  let totalItems = 0;

  // Process all content in a single pass
  const processContent = (
    items: (IBasePack | ISticker)[],
    weight: number,
    type: "pack" | "sticker"
  ) => {
    items?.forEach((item) => {
      // Process categories
      item.categories?.forEach((cat) => {
        const catId = cat.toString();
        categoryEngagement[catId] = (categoryEngagement[catId] || 0) + weight;
      });

      // Process animation preference
      if (
        type === "pack"
          ? (item as IBasePack).isAnimatedPack
          : (item as ISticker).isAnimated
      ) {
        animatedCount++;
      }

      // Process creator network for packs only
      if (type === "pack") {
        const creator = (item as IBasePack).creator;
        if (creator) {
          creatorSet.add(creator.toString());
        }

        // Process name tokens for packs only
        (item as IBasePack).name
          ?.toLowerCase()
          .split(/\W+/)
          .forEach((token) => token && nameTokens.add(token));
      }

      totalItems++;
    });
  };

  // Process all content types with appropriate weights
  processContent(user.packs, 3, "pack");
  processContent(user.favoritesPacks, 2, "pack");
  processContent(user.stickers, 1, "sticker");
  processContent(user.favoritesStickers, 1, "sticker");

  const interests: UserInterests = {
    preferredCategories: Object.keys(categoryEngagement).map(
      (id) => new Types.ObjectId(id)
    ),
    creatorNetwork: Array.from(creatorSet),
    nameSimilarities: Array.from(nameTokens),
    animatedPreference: animatedCount > totalItems / 2,
    engagementScore: categoryEngagement,
  };

  // Cache the results
  userInterestsCache.set(userId, {
    interests,
    timestamp: Date.now(),
  });

  return interests;
}

// Precompute match stage to avoid repetition
const getMatchStage = async (userId?: string): Promise<Record<string, any>> => {
  if (!userId) {
    return {
      isPrivate: false,
      isAuthorized: true,
    };
  }

  const user = await User.findById(userId)
    .select("favoritesPacks")
    .lean<{ favoritesPacks: Types.ObjectId[] }>();

  return {
    isPrivate: false,
    isAuthorized: true,
    _id: {
      $nin: user?.favoritesPacks || [],
    },
    creator: {
      $nin: [new Types.ObjectId(userId)],
    },
  };
};

export const getSuggestedPacks = async (
  page: number,
  limit: number,
  userId?: string,
  shownPackIds: string[] = [] // Add parameter to track shown packs
): Promise<{ packs: PackView[]; total: number }> => {
  const skip = (page - 1) * limit;

  // Convert shown pack IDs to ObjectIds
  const shownPackObjectIds = shownPackIds.map((id) => new Types.ObjectId(id));

  // Get match stage and user interests in parallel
  const [userInterests, baseMatchStage] = await Promise.all([
    userId ? getUserInterests(userId) : null,
    getMatchStage(userId),
  ]);

  // Add shown packs to exclusion list in match stage
  const matchStage = {
    ...baseMatchStage,
    _id: {
      $nin: [...(baseMatchStage._id?.$nin || []), ...shownPackObjectIds],
    },
  };

  // Fetch more items for randomization
  const fetchLimit = limit * 3;

  const pipeline: PipelineStage[] = [
    { $match: matchStage },
    {
      $project: {
        name: 1,
        categories: 1,
        isAnimatedPack: 1,
        creator: 1,
        stickers: 1,
        stats: 1,
        createdAt: 1,
      },
    },
    {
      $addFields: {
        suggestionScore: {
          $add: [
            ...(userInterests
              ? [
                  {
                    $multiply: [
                      {
                        $size: {
                          $setIntersection: [
                            "$categories",
                            userInterests.preferredCategories,
                          ],
                        },
                      },
                      200,
                    ],
                  },
                  {
                    $cond: {
                      if: {
                        $eq: [
                          "$isAnimatedPack",
                          userInterests.animatedPreference,
                        ],
                      },
                      then: 180,
                      else: 0,
                    },
                  },
                  {
                    $cond: {
                      if: {
                        $in: [
                          { $arrayElemAt: ["$creator", 0] },
                          userInterests.creatorNetwork.map(
                            (id) => new Types.ObjectId(id)
                          ),
                        ],
                      },
                      then: 120,
                      else: 0,
                    },
                  },
                ]
              : []),
            { $multiply: [{ $size: "$stickers" }, 50] },
            {
              $multiply: [
                {
                  $divide: [
                    { $subtract: ["$createdAt", new Date(2020, 0, 1)] },
                    86400000,
                  ],
                },
                0.1,
              ],
            },
            {
              $add: [
                { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 0.5] },
                { $multiply: [{ $ifNull: ["$stats.views", 0] }, 0.3] },
                { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 0.7] },
              ],
            },
          ],
        },
      },
    },
    { $sort: { suggestionScore: -1 } },
    { $skip: skip },
    { $limit: fetchLimit },
    // Add randomization stages
    { $addFields: { randomValue: { $rand: {} } } },
    { $sort: { randomValue: 1 } },
    { $project: { randomValue: 0 } }, // Remove the random field
  ];

  const [packs, totalCount] = await Promise.all([
    StickerPack.aggregate(pipeline),
    StickerPack.countDocuments(matchStage),
  ]);

  // Take only the required number of items
  const finalPacks = packs.slice(0, limit);
  const transformedPacks = await transformPacks(finalPacks);

  return {
    packs: transformedPacks,
    total: totalCount,
  };
};
