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

// Helper function to get a random number within a range
const getRandomInRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Helper function to get a random weight multiplier
const getRandomWeight = (): number => {
  return Math.random() * 0.5 + 0.75; // Returns a value between 0.75 and 1.25
};

async function analyzeUserPreferences(userId: string): Promise<UserPreferences | null> {
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

  // Randomize base weights for different interaction types
  const packWeight = getRandomInRange(2, 4);
  const stickerWeight = getRandomInRange(1, 2);

  [...(user.packs || []), ...(user.favoritesPacks || [])].forEach((pack) => {
    pack.categories.forEach((cat) => {
      const catId = cat.toString();
      const randomMultiplier = getRandomWeight();
      categoryWeights[catId] = (categoryWeights[catId] || 0) + packWeight * randomMultiplier;
    });

    creators.add(pack.creator.toString());

    const terms = [...(pack.name?.toLowerCase().split(/\W+/) || []), ...(pack.description?.toLowerCase().split(/\W+/) || [])].filter(
      (term) => term.length > 2
    );
    terms.forEach((term) => keywords.add(term));

    if (pack.isAnimatedPack) animatedCount++;
    totalItems++;
  });

  [...(user.stickers || []), ...(user.favoritesStickers || [])].forEach((sticker) => {
    sticker.categories.forEach((cat) => {
      const catId = cat.toString();
      const randomMultiplier = getRandomWeight();
      categoryWeights[catId] = (categoryWeights[catId] || 0) + stickerWeight * randomMultiplier;
    });

    if (sticker.isAnimated) animatedCount++;
    totalItems++;
  });

  // Add small random variation to animated preference threshold
  const animatedThreshold = 0.5 + (Math.random() * 0.1 - 0.05); // 45-55% threshold

  return {
    categories: Object.keys(categoryWeights).map((id) => new Types.ObjectId(id)),
    creators: Array.from(creators),
    keywords: Array.from(keywords),
    isAnimatedPreferred: animatedCount > totalItems * animatedThreshold,
    categoryWeights,
  };
}

export const getRecommendedPacks = async (userId?: string, hiddenPacks: string[] = []): Promise<PackView[]> => {
  // Convert string IDs to ObjectIds
  const hiddenPackIds = hiddenPacks.map((id) => new Types.ObjectId(id));

  const baseMatch = {
    isPrivate: false,
    isAuthorized: true,
    ...(hiddenPackIds.length > 0 && {
      _id: { $nin: hiddenPackIds },
    }),
  };

  if (!userId) {
    const yearWeight = getRandomInRange(5, 15);
    const categoryWeight = getRandomInRange(1, 3);
    const stickerWeight = getRandomInRange(1, 3);

    const pipeline: PipelineStage[] = [
      { $match: baseMatch },
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
          defaultScore: {
            $add: [
              { $multiply: [{ $size: "$categories" }, categoryWeight] },
              { $multiply: [{ $size: "$stickers" }, stickerWeight] },
              {
                $multiply: [{ $subtract: [{ $year: "$createdAt" }, 2020] }, yearWeight],
              },
              { $multiply: [{ $rand: {} }, getRandomInRange(20, 50)] },
            ],
          },
        },
      },
      { $sort: { defaultScore: -1 } },
      { $limit: getRandomInRange(5, 8) },
    ];

    const packs = await StickerPack.aggregate(pipeline);
    return transformPacks(packs);
  }

  const userPreferences = await analyzeUserPreferences(userId);

  if (!userPreferences) {
    const yearWeight = getRandomInRange(5, 15);
    const pipeline: PipelineStage[] = [
      { $match: baseMatch },
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
          defaultScore: {
            $add: [
              { $multiply: [{ $size: "$categories" }, getRandomInRange(1, 3)] },
              { $multiply: [{ $size: "$stickers" }, getRandomInRange(1, 3)] },
              {
                $multiply: [{ $subtract: [{ $year: "$createdAt" }, 2020] }, yearWeight],
              },
              { $multiply: [{ $rand: {} }, getRandomInRange(20, 50)] },
            ],
          },
        },
      },
      { $sort: { defaultScore: -1 } },
      { $limit: getRandomInRange(5, 8) },
    ];

    const packs = await StickerPack.aggregate(pipeline);
    if (packs.length === 0) {
      const fallbackPipeline = [
        { $match: baseMatch },
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
        {
          $lookup: {
            from: "categories",
            localField: "categories",
            foreignField: "_id",
            as: "categories",
          },
        },
        { $sample: { size: getRandomInRange(5, 8) } },
      ];
      return transformPacks(await StickerPack.aggregate(fallbackPipeline));
    }
    return transformPacks(packs);
  }

  // Personalized recommendations
  const categoryBaseWeight = getRandomInRange(40, 60);
  const creatorWeight = getRandomInRange(250, 350);
  const animationWeight = getRandomInRange(150, 250);
  const keywordWeight = getRandomInRange(40, 60);

  const pipeline: PipelineStage[] = [
    { $match: baseMatch },
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
        terms: {
          $concat: [{ $toLower: "$name" }, " ", { $ifNull: [{ $toLower: "$description" }, ""] }],
        },
      },
    },
    {
      $addFields: {
        recommendationScore: {
          $add: [
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
                                  field: { $toString: "$$this._id" },
                                  input: userPreferences.categoryWeights,
                                },
                              },
                            },
                            categoryBaseWeight,
                          ],
                        },
                        0,
                      ],
                    },
                  ],
                },
              },
            },
            {
              $cond: {
                if: {
                  $in: ["$creator._id", userPreferences.creators.map((id) => new Types.ObjectId(id))],
                },
                then: creatorWeight,
                else: 0,
              },
            },
            {
              $cond: {
                if: {
                  $eq: ["$isAnimatedPack", userPreferences.isAnimatedPreferred],
                },
                then: animationWeight,
                else: 0,
              },
            },
            {
              $multiply: [
                {
                  $size: {
                    $setIntersection: [{ $split: ["$terms", " "] }, userPreferences.keywords],
                  },
                },
                keywordWeight,
              ],
            },
            { $multiply: [{ $rand: {} }, getRandomInRange(20, 50)] },
          ],
        },
      },
    },
    { $sort: { recommendationScore: -1 } },
    { $limit: getRandomInRange(5, 8) },
  ];

  try {
    const packs = await StickerPack.aggregate(pipeline);

    if (packs.length === 0) {
      const fallbackPipeline = [
        { $match: baseMatch },
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
        {
          $lookup: {
            from: "categories",
            localField: "categories",
            foreignField: "_id",
            as: "categories",
          },
        },
        { $sample: { size: getRandomInRange(5, 8) } },
      ];
      const fallbackPacks = await StickerPack.aggregate(fallbackPipeline);
      return transformPacks(fallbackPacks);
    }

    return transformPacks(packs);
  } catch (error) {
    console.error("Error in recommendation pipeline:", error);
    const emergencyPipeline = [
      { $match: baseMatch },
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
      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      { $sample: { size: getRandomInRange(5, 8) } },
    ];
    const emergencyPacks = await StickerPack.aggregate(emergencyPipeline);
    return transformPacks(emergencyPacks);
  }
};
