import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";
import { analyzeUserPreferences } from ".";

export const getSuggestedPacks = async (
  page: number,
  limit: number,
  userId?: string
): Promise<{ packs: PackView[]; total: number }> => {
  const skip = (page - 1) * limit;
  const userPreferences = userId ? await analyzeUserPreferences(userId) : null;

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
          creator: {
            $nin: [new Types.ObjectId(userId)],
          },
        }),
      },
    },
    {
      $addFields: {
        suggestionScore: {
          $add: [
            { $multiply: [{ $ifNull: ["$stats.downloads", 0] }, 5] },
            { $multiply: [{ $ifNull: ["$stats.views", 0] }, 3] },
            { $multiply: [{ $ifNull: ["$stats.favorites", 0] }, 7] },
            { $multiply: [{ $size: "$stickers" }, 2] },
            ...(userPreferences
              ? [
                  {
                    $multiply: [
                      {
                        $size: {
                          $setIntersection: [
                            "$categories",
                            userPreferences.preferredCategories.map(
                              (id) => new Types.ObjectId(id)
                            ),
                          ],
                        },
                      },
                      100,
                    ],
                  },
                  {
                    $cond: {
                      if: {
                        $eq: [
                          "$isAnimatedPack",
                          userPreferences.animatedPreference,
                        ],
                      },
                      then: 150,
                      else: 0,
                    },
                  },
                ]
              : []),
          ],
        },
      },
    },
    { $sort: { suggestionScore: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const [packs, totalCount] = await Promise.all([
    StickerPack.aggregate(pipeline),
    StickerPack.countDocuments({
      isPrivate: false,
      isAuthorized: true,
      ...(userId && {
        _id: {
          $nin: await User.findById(userId)
            .select("favoritesPacks")
            .then((u) => u?.favoritesPacks || []),
        },
        creator: {
          $nin: [new Types.ObjectId(userId)],
        },
      }),
    }),
  ]);

  const transformedPacks = await transformPacks(packs);

  return {
    packs: transformedPacks,
    total: totalCount,
  };
};
