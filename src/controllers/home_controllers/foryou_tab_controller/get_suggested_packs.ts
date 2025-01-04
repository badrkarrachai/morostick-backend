import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";
import User from "../../../models/users_model";

export async function getSuggestedPacks(
  page: number = 1,
  limit: number = 20,
  userId?: string,
  excludePackIds: string[] = []
): Promise<{ packs: PackView[]; total: number }> {
  try {
    // Base match conditions
    const baseMatch: any = {
      isPrivate: false,
      isAuthorized: true,
    };

    // Add excluded packs to match condition if any
    if (excludePackIds.length > 0) {
      baseMatch._id = {
        $nin: excludePackIds.map((id) => new Types.ObjectId(id)),
      };
    }

    // For non-authenticated users - sort by popularity
    if (!userId) {
      const pipeline: PipelineStage[] = [
        { $match: baseMatch },
        // Calculate popularity score
        {
          $addFields: {
            popularityScore: {
              $add: [
                { $ifNull: ["$stats.downloads", 0] },
                { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 2] },
                { $ifNull: ["$stats.views", 0] },
              ],
            },
          },
        },
        // Sort by popularity and _id for consistency
        { $sort: { popularityScore: -1, _id: 1 } },
        // Pagination
        { $skip: Math.max(0, (page - 1) * limit) },
        { $limit: limit },
        // Remove scoring field
        { $project: { popularityScore: 0 } },
      ];

      const [packs, total] = await Promise.all([StickerPack.aggregate(pipeline), StickerPack.countDocuments(baseMatch)]);

      const transformedPacks = await transformPacks(packs);
      return { packs: transformedPacks, total };
    }

    // For authenticated users - personalized suggestions
    const user = await User.findById(userId).select("favoritesPacks packs").populate("favoritesPacks", "categories creator isAnimatedPack").lean();

    if (!user) {
      // Fallback to non-authenticated suggestions if user not found
      return getSuggestedPacks(page, limit, undefined, excludePackIds);
    }

    // Get user preferences
    const userPrefs = {
      categories: new Set<string>(),
      creators: new Set<string>(),
      animatedCount: 0,
      totalPacks: 0,
    };

    // Process user's favorite packs
    const processPacks = (packs: any[]) => {
      packs?.forEach((pack) => {
        // Track categories
        pack.categories?.forEach((catId: any) => userPrefs.categories.add(catId.toString()));

        // Track creators
        if (pack.creator) {
          userPrefs.creators.add(pack.creator.toString());
        }

        // Track animation preference
        if (pack.isAnimatedPack) {
          userPrefs.animatedCount++;
        }
        userPrefs.totalPacks++;
      });
    };

    processPacks(user.favoritesPacks);
    processPacks(user.packs);

    const prefersAnimated = userPrefs.animatedCount > userPrefs.totalPacks / 2;

    // Build personalized pipeline
    const personalizedPipeline: PipelineStage[] = [
      { $match: baseMatch },
      {
        $addFields: {
          personalScore: {
            $add: [
              // Base engagement score
              {
                $add: [
                  { $ifNull: ["$stats.downloads", 0] },
                  { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 2] },
                  { $ifNull: ["$stats.views", 0] },
                ],
              },
              // Category match bonus
              {
                $multiply: [
                  {
                    $size: {
                      $setIntersection: ["$categories", Array.from(userPrefs.categories).map((id) => new Types.ObjectId(id))],
                    },
                  },
                  1000,
                ],
              },
              // Creator match bonus
              {
                $cond: {
                  if: { $in: ["$creator", Array.from(userPrefs.creators).map((id) => new Types.ObjectId(id))] },
                  then: 500,
                  else: 0,
                },
              },
              // Animation preference match
              {
                $cond: {
                  if: { $eq: ["$isAnimatedPack", prefersAnimated] },
                  then: 250,
                  else: 0,
                },
              },
            ],
          },
        },
      },
      { $sort: { personalScore: -1, _id: 1 } },
      { $skip: Math.max(0, (page - 1) * limit) },
      { $limit: limit },
      { $project: { personalScore: 0 } },
    ];

    const [packs, total] = await Promise.all([StickerPack.aggregate(personalizedPipeline), StickerPack.countDocuments(baseMatch)]);

    const transformedPacks = await transformPacks(packs);
    return { packs: transformedPacks, total };
  } catch (error) {
    console.error("Error in getSuggestedPacks:", error);
    // Fallback to basic sorting if anything fails
    const pipeline: PipelineStage[] = [
      { $match: { isPrivate: false, isAuthorized: true } },
      { $sort: { createdAt: -1, _id: 1 } },
      { $skip: Math.max(0, (page - 1) * limit) },
      { $limit: limit },
    ];

    const [packs, total] = await Promise.all([StickerPack.aggregate(pipeline), StickerPack.countDocuments({ isPrivate: false, isAuthorized: true })]);

    const transformedPacks = await transformPacks(packs);
    return { packs: transformedPacks, total };
  }
}
