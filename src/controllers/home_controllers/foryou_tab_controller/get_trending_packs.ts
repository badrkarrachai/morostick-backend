import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";

// Constants to avoid magic numbers
const TIME_WINDOW = {
  MIN_DAYS: 15,
  MAX_DAYS: 45,
  FALLBACK_DAYS: 90,
} as const;

const WEIGHTS = {
  DOWNLOADS: { MIN: 8, MAX: 12 },
  VIEWS: { MIN: 4, MAX: 6 },
  FAVORITES: { MIN: 7, MAX: 9 },
  TIME_DECAY: { MIN: 90, MAX: 110 },
  RANDOM_BOOST: { MIN: 20, MAX: 40 },
  ACTIVITY_BONUS: { MIN: 10, MAX: 20 },
  HOURLY_VARIATION: { MIN: 5, MAX: 15 },
} as const;

const PACK_LIMITS = {
  MIN: 8,
  MAX: 12,
} as const;

// Helper function to get a random number within a range
const getRandomInRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getTrendingPacks = async (userId?: string, hiddenPacks: string[] = []): Promise<PackView[]> => {
  try {
    // Convert string IDs to ObjectIds
    const excludedPackIds = hiddenPacks.map((id) => new Types.ObjectId(id));

    // Initialize time window
    const randomDays = getRandomInRange(TIME_WINDOW.MIN_DAYS, TIME_WINDOW.MAX_DAYS);
    const dateWindow = new Date();
    dateWindow.setDate(dateWindow.getDate() - randomDays);

    // Initialize weights
    const weights = {
      download: getRandomInRange(WEIGHTS.DOWNLOADS.MIN, WEIGHTS.DOWNLOADS.MAX),
      view: getRandomInRange(WEIGHTS.VIEWS.MIN, WEIGHTS.VIEWS.MAX),
      favorite: getRandomInRange(WEIGHTS.FAVORITES.MIN, WEIGHTS.FAVORITES.MAX),
      timeDecay: getRandomInRange(WEIGHTS.TIME_DECAY.MIN, WEIGHTS.TIME_DECAY.MAX),
    };

    const pipeline: PipelineStage[] = [
      {
        $match: {
          isPrivate: false,
          isAuthorized: true,
          createdAt: { $gte: dateWindow },
          ...(excludedPackIds.length > 0 && {
            _id: { $nin: excludedPackIds },
          }),
        },
      },
      // Populate creator
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [
            {
              $lookup: {
                from: "images",
                localField: "avatar",
                foreignField: "_id",
                as: "avatar",
              },
            },
            {
              $addFields: {
                avatar: { $arrayElemAt: ["$avatar", 0] },
              },
            },
            {
              $project: {
                name: 1,
                avatar: { url: 1 },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      // Populate categories
      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $addFields: {
          randomBoost: { $rand: {} },
          baseMetrics: {
            $add: [
              { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, weights.download] },
              { $multiply: [{ $ifNull: ["$stats.views", 0] }, weights.view] },
              { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, weights.favorite] },
            ],
          },
          timeDecay: {
            $multiply: [
              {
                $divide: [1, { $add: [{ $divide: [{ $subtract: [new Date(), "$createdAt"] }, 86400000] }, 1] }],
              },
              weights.timeDecay,
            ],
          },
        },
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              "$baseMetrics",
              "$timeDecay",
              { $multiply: ["$randomBoost", getRandomInRange(WEIGHTS.RANDOM_BOOST.MIN, WEIGHTS.RANDOM_BOOST.MAX)] },
              {
                $cond: {
                  if: {
                    $and: [{ $gt: ["$stats.downloads", 0] }, { $gt: ["$stats.views", 0] }, { $gt: ["$stats.favorites", 0] }],
                  },
                  then: { $multiply: [{ $rand: {} }, getRandomInRange(WEIGHTS.ACTIVITY_BONUS.MIN, WEIGHTS.ACTIVITY_BONUS.MAX)] },
                  else: 0,
                },
              },
              {
                $multiply: [
                  { $rand: {} },
                  { $mod: [{ $hour: new Date() }, getRandomInRange(WEIGHTS.HOURLY_VARIATION.MIN, WEIGHTS.HOURLY_VARIATION.MAX)] },
                ],
              },
            ],
          },
        },
      },
      { $sort: { trendingScore: -1 } },
      { $limit: getRandomInRange(PACK_LIMITS.MIN, PACK_LIMITS.MAX) },
    ];

    // Try to get trending packs
    const packs = await StickerPack.aggregate(pipeline);

    if (packs.length === 0) {
      // First fallback: Try with extended time window
      const fallbackDateWindow = new Date();
      fallbackDateWindow.setDate(fallbackDateWindow.getDate() - TIME_WINDOW.FALLBACK_DAYS);

      const fallbackPipeline = [
        {
          $match: {
            isPrivate: false,
            isAuthorized: true,
            createdAt: { $gte: fallbackDateWindow },
            ...(excludedPackIds.length > 0 && {
              _id: { $nin: excludedPackIds },
            }),
          },
        },
        // Populate creator
        {
          $lookup: {
            from: "users",
            localField: "creator",
            foreignField: "_id",
            as: "creator",
            pipeline: [
              {
                $lookup: {
                  from: "images",
                  localField: "avatar",
                  foreignField: "_id",
                  as: "avatar",
                },
              },
              {
                $addFields: {
                  avatar: { $arrayElemAt: ["$avatar", 0] },
                },
              },
              {
                $project: {
                  name: 1,
                  avatar: { url: 1 },
                },
              },
            ],
          },
        },
        {
          $addFields: {
            creator: { $arrayElemAt: ["$creator", 0] },
          },
        },
        // Populate categories
        {
          $lookup: {
            from: "categories",
            localField: "categories",
            foreignField: "_id",
            as: "categories",
          },
        },
        { $sample: { size: getRandomInRange(PACK_LIMITS.MIN, PACK_LIMITS.MAX) } },
      ];
      const fallbackPacks = await StickerPack.aggregate(fallbackPipeline);

      if (fallbackPacks.length > 0) {
        return transformPacks(fallbackPacks);
      }
    }

    // Process trending packs if found
    if (packs.length > 0) {
      const shuffledPacks = packs
        .map((pack) => ({
          ...pack,
          shuffleScore: Math.random(),
        }))
        .sort((a, b) => {
          const scoreDiff = b.trendingScore - a.trendingScore;
          return Math.abs(scoreDiff) < b.trendingScore * 0.05 ? b.shuffleScore - a.shuffleScore : scoreDiff;
        });

      return transformPacks(shuffledPacks);
    }

    // Emergency fallback: Get any authorized packs
    const emergencyPipeline = [
      {
        $match: {
          isPrivate: false,
          isAuthorized: true,
          ...(excludedPackIds.length > 0 && {
            _id: { $nin: excludedPackIds },
          }),
        },
      },
      // Populate creator
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [
            {
              $lookup: {
                from: "images",
                localField: "avatar",
                foreignField: "_id",
                as: "avatar",
              },
            },
            {
              $addFields: {
                avatar: { $arrayElemAt: ["$avatar", 0] },
              },
            },
            {
              $project: {
                name: 1,
                avatar: { url: 1 },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      // Populate categories
      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      { $sample: { size: getRandomInRange(PACK_LIMITS.MIN, PACK_LIMITS.MAX) } },
    ];
    const emergencyPacks = await StickerPack.aggregate(emergencyPipeline);

    return transformPacks(emergencyPacks);
  } catch (error) {
    console.error("Error in getTrendingPacks:", error);
    return [];
  }
};
