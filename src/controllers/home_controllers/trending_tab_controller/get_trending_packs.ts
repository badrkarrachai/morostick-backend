import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";

export const getTrendingPacks = async (
  page: number,
  limit: number,
  categoryId?: string,
  userId?: string,
  shownPackIds: string[] = []
): Promise<{ packs: PackView[]; total: number }> => {
  const skip = (page - 1) * limit;

  // Get user's favorites and hidden packs in a single query if userId provided
  const userPacks = userId
    ? await User.findById(userId)
        .select("favoritesPacks hiddenPacks -_id")
        .lean()
        .then((u) => ({
          hiddenPacks: u?.hiddenPacks || [],
        }))
    : { favoritesPacks: [], hiddenPacks: [] };

  // Combine all excluded pack IDs
  const excludedPackIds = [...userPacks.hiddenPacks];

  const matchStage: PipelineStage.Match = {
    $match: {
      isPrivate: false,
      isAuthorized: true,
      _id: { $nin: excludedPackIds },
      ...(categoryId && {
        categories: new Types.ObjectId(categoryId),
      }),
    },
  };

  // Enhanced trending score calculation that includes views
  const calculateTrendingScore = {
    $addFields: {
      trendingScore: {
        $add: [
          { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 10] },
          { $multiply: [{ $ifNull: ["$stats.views", 0] }, 5] },
          { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 8] },
          // Add time decay factor
          {
            $divide: [
              1000000,
              {
                $add: [
                  1,
                  {
                    $divide: [
                      { $subtract: [new Date(), "$createdAt"] },
                      86400000, // milliseconds in a day
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };

  const fetchLimit = limit * 3;
  const pipeline: PipelineStage[] = [
    matchStage,
    calculateTrendingScore,
    { $sort: { trendingScore: -1 } },
    { $skip: skip },
    { $limit: fetchLimit },
    { $addFields: { randomValue: { $rand: {} } } },
    { $sort: { randomValue: 1 } },
    { $project: { randomValue: 0 } },
  ];

  const [packs, totalCount] = await Promise.all([
    StickerPack.aggregate(pipeline).allowDiskUse(true).option({ maxTimeMS: 5000 }),
    StickerPack.countDocuments(matchStage.$match),
  ]);

  const finalPacks = packs.slice(0, limit);
  const transformedPacks = await transformPacks(finalPacks);

  return {
    packs: transformedPacks,
    total: totalCount,
  };
};
