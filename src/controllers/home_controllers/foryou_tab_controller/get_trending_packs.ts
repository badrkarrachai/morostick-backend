import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";

export const getTrendingPacks = async (
  userId?: string
): Promise<PackView[]> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const pipeline: PipelineStage[] = [
    {
      $match: {
        isPrivate: false,
        isAuthorized: true,
        createdAt: { $gte: thirtyDaysAgo },
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
        trendingScore: {
          $add: [
            { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 10] },
            { $multiply: [{ $ifNull: ["$stats.views", 0] }, 5] },
            { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 8] },
            {
              $multiply: [
                {
                  $divide: [
                    1,
                    {
                      $add: [
                        {
                          $divide: [
                            { $subtract: [new Date(), "$createdAt"] },
                            86400000,
                          ],
                        },
                        1,
                      ],
                    },
                  ],
                },
                100,
              ],
            },
          ],
        },
      },
    },
    { $sort: { trendingScore: -1 } },
    { $limit: 10 },
  ];

  const packs = await StickerPack.aggregate(pipeline);
  const transformedPacks = await transformPacks(packs);
  return transformedPacks;
};
