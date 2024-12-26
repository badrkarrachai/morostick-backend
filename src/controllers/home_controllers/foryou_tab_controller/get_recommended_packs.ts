import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";
import { IBasePack } from "../../../interfaces/pack_interface";
import { ISticker } from "../../../interfaces/sticker_interface";

interface PopulatedUserDocument {
  packs: IBasePack[];
  favoritesPacks: IBasePack[];
  stickers: ISticker[];
  favoritesStickers: ISticker[];
}

interface UserPreferences {
  categories: Types.ObjectId[];
  creators: string[];
  keywords: string[];
  isAnimatedPreferred: boolean;
  categoryWeights: Record<string, number>;
}

async function analyzeUserPreferences(
  userId: string
): Promise<UserPreferences | null> {
  const user = await User.findById(userId)
    .select("packs favoritesPacks stickers favoritesStickers")
    .populate([
      {
        path: "packs favoritesPacks",
        select: "name categories isAnimatedPack creator description",
        model: "Pack",
      },
      {
        path: "stickers favoritesStickers",
        select: "categories isAnimated name",
        model: "Sticker",
      },
    ])
    .lean<PopulatedUserDocument>();

  if (!user) return null;

  const categoryWeights: Record<string, number> = {};
  const creators = new Set<string>();
  const keywords = new Set<string>();
  let animatedCount = 0;
  let totalItems = 0;

  // Process user's own and favorite packs
  [...(user.packs || []), ...(user.favoritesPacks || [])].forEach((pack) => {
    // Process categories with higher weight for direct interactions
    pack.categories.forEach((cat) => {
      const catId = cat.toString();
      categoryWeights[catId] = (categoryWeights[catId] || 0) + 3;
    });

    // Process creators
    pack.creator.forEach((creator) => creators.add(creator.toString()));

    // Extract keywords from name and description
    const terms = [
      ...(pack.name?.toLowerCase().split(/\W+/) || []),
      ...(pack.description?.toLowerCase().split(/\W+/) || []),
    ].filter((term) => term.length > 2); // Filter out short terms
    terms.forEach((term) => keywords.add(term));

    if (pack.isAnimatedPack) animatedCount++;
    totalItems++;
  });

  // Process stickers with lower weight
  [...(user.stickers || []), ...(user.favoritesStickers || [])].forEach(
    (sticker) => {
      sticker.categories.forEach((cat) => {
        const catId = cat.toString();
        categoryWeights[catId] = (categoryWeights[catId] || 0) + 1;
      });

      if (sticker.isAnimated) animatedCount++;
      totalItems++;
    }
  );

  return {
    categories: Object.keys(categoryWeights).map(
      (id) => new Types.ObjectId(id)
    ),
    creators: Array.from(creators),
    keywords: Array.from(keywords),
    isAnimatedPreferred: animatedCount > totalItems / 2,
    categoryWeights,
  };
}

export const getRecommendedPacks = async (
  userId?: string
): Promise<PackView[]> => {
  let pipeline: PipelineStage[];

  if (!userId) {
    // Default pipeline for users without ID
    pipeline = [
      {
        $match: {
          isPrivate: false,
          isAuthorized: true,
        },
      },
      {
        $addFields: {
          defaultScore: {
            $add: [
              { $size: "$categories" }, // Favor packs with more categories
              { $size: "$stickers" }, // Favor complete packs
              {
                $multiply: [
                  {
                    $subtract: [{ $year: "$createdAt" }, 2020],
                  },
                  10,
                ],
              },
            ],
          },
        },
      },
      { $sort: { defaultScore: -1 } },
      { $limit: 5 },
    ];
  } else {
    const userPreferences = await analyzeUserPreferences(userId);

    if (!userPreferences) {
      // Fallback pipeline for users without preferences
      pipeline = [
        {
          $match: {
            isPrivate: false,
            isAuthorized: true,
            _id: {
              $nin: await User.findById(userId)
                .select("favoritesPacks")
                .then((u) => u?.favoritesPacks || []),
            },
          },
        },
        {
          $addFields: {
            defaultScore: {
              $add: [
                { $size: "$categories" },
                { $size: "$stickers" },
                {
                  $multiply: [
                    {
                      $subtract: [{ $year: "$createdAt" }, 2020],
                    },
                    10,
                  ],
                },
              ],
            },
          },
        },
        { $sort: { defaultScore: -1 } },
        { $limit: 5 },
      ];
    } else {
      const pipeline: PipelineStage[] = [
        {
          $match: {
            isPrivate: false,
            isAuthorized: true,
            _id: {
              $nin: await User.findById(userId)
                .select("favoritesPacks")
                .then((u) => u?.favoritesPacks || []),
            },
          },
        },
        {
          $addFields: {
            // Extract terms from pack name and description
            terms: {
              $concat: [
                { $toLower: "$name" },
                " ",
                { $ifNull: [{ $toLower: "$description" }, ""] },
              ],
            },
          },
        },
        {
          $addFields: {
            recommendationScore: {
              $add: [
                // Category matching score (highest priority)
                {
                  $reduce: {
                    input: "$categories",
                    initialValue: 0,
                    in: {
                      $add: [
                        "$$value",
                        {
                          $ifNull: [
                            {
                              $multiply: [
                                {
                                  $toDouble: {
                                    $getField: {
                                      field: { $toString: "$$this" },
                                      input: userPreferences.categoryWeights,
                                    },
                                  },
                                },
                                50, // Base weight for category matches
                              ],
                            },
                            0,
                          ],
                        },
                      ],
                    },
                  },
                },
                // Creator preference (high priority)
                {
                  $cond: {
                    if: {
                      $in: [
                        { $arrayElemAt: ["$creator", 0] },
                        userPreferences.creators.map(
                          (id) => new Types.ObjectId(id)
                        ),
                      ],
                    },
                    then: 300,
                    else: 0,
                  },
                },
                // Animation preference (medium priority)
                {
                  $cond: {
                    if: {
                      $eq: [
                        "$isAnimatedPack",
                        userPreferences.isAnimatedPreferred,
                      ],
                    },
                    then: 200,
                    else: 0,
                  },
                },
                // Keyword matching (lower priority)
                {
                  $multiply: [
                    {
                      $size: {
                        $setIntersection: [
                          { $split: ["$terms", " "] },
                          userPreferences.keywords,
                        ],
                      },
                    },
                    50,
                  ],
                },
              ],
            },
          },
        },
        { $sort: { recommendationScore: -1 } },
        { $limit: 5 },
      ];
    }
  }

  try {
    const packs = await StickerPack.aggregate(pipeline);

    if (packs.length === 0) {
      // Final fallback: get any valid packs if all other methods return empty
      const fallbackPacks = await StickerPack.aggregate([
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
        { $sample: { size: 5 } },
      ]);
      return transformPacks(fallbackPacks);
    }

    return transformPacks(packs);
  } catch (error) {
    console.error("Error in getRecommendedPacks:", error);
    // Ultimate fallback: get any 5 random valid packs
    const emergencyPacks = await StickerPack.aggregate([
      {
        $match: {
          isPrivate: false,
          isAuthorized: true,
        },
      },
      { $sample: { size: 5 } },
    ]);
    return transformPacks(emergencyPacks);
  }
};
