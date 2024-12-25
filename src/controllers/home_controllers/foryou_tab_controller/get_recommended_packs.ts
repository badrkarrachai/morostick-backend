import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";
import { analyzeUserPreferences } from ".";

export const getRecommendedPacks = async (
  userId?: string
): Promise<PackView[]> => {
  let userPreferences = userId ? await analyzeUserPreferences(userId) : null;

  const pipeline: PipelineStage[] = [
    {
      $match: {
        isPrivate: false,
        isAuthorized: true,
        ...(userId && {
          _id: {
            $nin: await User.findById(userId)
              .select("favoritesPacks")
              .then((u) => u?.favoritesPacks || []),
          },
        }),
      },
    },
    {
      $addFields: {
        recommendationScore: {
          $add: [
            { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 10] },
            { $multiply: [{ $ifNull: ["$stats.views", 0] }, 5] },
            { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 15] },
            ...(userPreferences
              ? [
                  {
                    $cond: {
                      if: {
                        $in: [
                          "$creator",
                          userPreferences.favoriteCreators.map(
                            (id) => new Types.ObjectId(id)
                          ),
                        ],
                      },
                      then: 500,
                      else: 0,
                    },
                  },
                  {
                    $cond: {
                      if: {
                        $eq: [
                          "$isAnimatedPack",
                          userPreferences.animatedPreference,
                        ],
                      },
                      then: 200,
                      else: 0,
                    },
                  },
                ]
              : []),
          ],
        },
      },
    },
    { $sort: { recommendationScore: -1 } },
    { $limit: 5 },
  ];

  const packs = await StickerPack.aggregate(pipeline);
  const transformedPacks = await transformPacks(packs);
  return transformedPacks;
};
