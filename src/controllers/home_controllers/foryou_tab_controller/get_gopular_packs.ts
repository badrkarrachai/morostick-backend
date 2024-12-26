import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";

export const getPopularPacks = async (userId?: string): Promise<PackView[]> => {
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
        popularityScore: {
          $add: [
            { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 1] },
            { $multiply: [{ $ifNull: ["$stats.views", 0] }, 0.5] },
            { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 2] },
          ],
        },
      },
    },
    { $sort: { popularityScore: -1 } },
    { $limit: 10 },
  ];

  const packs = await StickerPack.aggregate(pipeline);
  const transformedPacks = await transformPacks(packs);
  return transformedPacks;
};
