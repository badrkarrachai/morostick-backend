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
  shownPackIds: string[] = [] // Add parameter to track shown packs
): Promise<{ packs: PackView[]; total: number }> => {
  const skip = (page - 1) * limit;

  // Get user favorites if logged in
  const userFavorites = userId
    ? await User.findById(userId)
        .select("favoritesPacks -_id")
        .lean()
        .then((u) => u?.favoritesPacks || [])
    : [];

  // Convert shown pack IDs to ObjectIds
  const shownPackObjectIds = shownPackIds.map((id) => new Types.ObjectId(id));

  // Base match conditions
  const matchStage: PipelineStage.Match = {
    $match: {
      isPrivate: false,
      isAuthorized: true,
      _id: { $nin: [...shownPackObjectIds] }, // Exclude already shown packs
      ...(categoryId && {
        categories: new Types.ObjectId(categoryId),
      }),
      ...(userId &&
        userFavorites.length > 0 && {
          _id: { $nin: [...userFavorites, ...shownPackObjectIds] },
        }),
    },
  };

  const calculateTrendingScore = {
    $addFields: {
      trendingScore: {
        $add: [
          { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 10] },
          { $multiply: [{ $ifNull: ["$stats.views", 0] }, 5] },
          { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 8] },
        ],
      },
    },
  };

  // Fetch more items for randomization on all pages
  const fetchLimit = limit * 3;
  const pipeline: PipelineStage[] = [
    matchStage,
    calculateTrendingScore,
    { $sort: { trendingScore: -1 } },
    { $skip: skip },
    { $limit: fetchLimit },
    // Add a random sort stage
    { $addFields: { randomValue: { $rand: {} } } },
    { $sort: { randomValue: 1 } },
    { $project: { randomValue: 0 } }, // Remove the random field
  ];

  // Execute query and count in parallel
  const [packs, totalCount] = await Promise.all([
    StickerPack.aggregate(pipeline)
      .allowDiskUse(true)
      .option({ maxTimeMS: 5000 }),
    StickerPack.countDocuments(matchStage.$match),
  ]);

  // Take only the required number of items
  const finalPacks = packs.slice(0, limit);
  const transformedPacks = await transformPacks(finalPacks);

  return {
    packs: transformedPacks,
    total: totalCount,
  };
};
