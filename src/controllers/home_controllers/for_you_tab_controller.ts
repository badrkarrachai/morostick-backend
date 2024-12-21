import { Request, Response } from "express";
import { Types, PipelineStage } from "mongoose";
import { StickerPack } from "../../models/pack_model";
import User from "../../models/users_model";
import { Sticker } from "../../models/sticker_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { query } from "express-validator";
import { IPackPreview } from "../../interfaces/pack_interface";
import { PackPreviewFormatter } from "../../utils/responces_templates/pack_response_template";
import { PACK_REQUIREMENTS } from "../../config/app_requirement";

interface ForYouResponse {
  recommended: IPackPreview[];
  trending: IPackPreview[];
  suggested: {
    packs: IPackPreview[];
    pagination: {
      currentPage: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

export const getForYouValidationRules = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than 0"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),
];

const analyzeUserPreferences = async (userId: string) => {
  const user = await User.findById(userId)
    .populate("favoritesPacks")
    .populate("favoritesStickers");

  if (!user) return null;

  const favoritePacks = user.favoritesPacks as any[];
  const favoriteStickers = user.favoritesStickers as any[];

  return {
    favoriteCreators: [
      ...new Set(favoritePacks.map((pack) => pack.creator._id.toString())),
    ],

    favoriteTags: favoriteStickers
      .reduce(
        (tags: string[], sticker) => [...tags, ...(sticker.tags || [])],
        []
      )
      .reduce((acc: { [key: string]: number }, tag: string) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {}),

    animatedPreference:
      favoriteStickers.filter((s) => s.isAnimated).length /
        favoriteStickers.length >
      0.5,

    favoriteThemes: favoritePacks
      .reduce((themes: string[], pack) => {
        const words = `${pack.name} ${pack.description || ""}`
          .toLowerCase()
          .split(/\W+/)
          .filter((word) => word.length > 3);
        return [...themes, ...words];
      }, [])
      .reduce((acc: { [key: string]: number }, theme: string) => {
        acc[theme] = (acc[theme] || 0) + 1;
        return acc;
      }, {}),
  };
};

const getRecommendedPacks = async (
  userId?: string
): Promise<IPackPreview[]> => {
  let userPreferences = null;
  if (userId) {
    userPreferences = await analyzeUserPreferences(userId);
  }

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
      $lookup: {
        from: "stickers",
        let: { stickerIds: "$stickers" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$stickerIds"] },
            },
          },
        ],
        as: "allStickers",
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
                          "$creator._id",
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
                  {
                    $multiply: [
                      {
                        $size: {
                          $setIntersection: [
                            "$allStickers.tags",
                            Object.keys(userPreferences.favoriteTags).slice(
                              0,
                              10
                            ),
                          ],
                        },
                      },
                      50,
                    ],
                  },
                ]
              : []),
          ],
        },
      },
    },
    {
      $lookup: {
        from: "stickers",
        let: { stickerIds: "$stickers" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$stickerIds"] },
            },
          },
          {
            $sort: { position: 1 },
          },
          {
            $limit: PACK_REQUIREMENTS.maxPreviewStickers,
          },
        ],
        as: "previewStickers",
      },
    },
    {
      $sort: { recommendationScore: -1 },
    },
    {
      $limit: 5,
    },
  ];

  const packs = await StickerPack.aggregate(pipeline);
  return packs.map((pack) => PackPreviewFormatter.toPackPreview(pack));
};

const getTrendingPacks = async (userId?: string): Promise<IPackPreview[]> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userFavorites = userId
    ? await User.findById(userId)
        .select("favoritesPacks")
        .then((u) => u?.favoritesPacks || [])
    : [];

  const pipeline: PipelineStage[] = [
    {
      $match: {
        isPrivate: false,
        isAuthorized: true,
        createdAt: { $gte: thirtyDaysAgo },
        ...(userId && {
          _id: { $nin: userFavorites },
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
    {
      $lookup: {
        from: "stickers",
        let: { stickerIds: "$stickers" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$stickerIds"] },
            },
          },
          {
            $sort: { position: 1 },
          },
          {
            $limit: PACK_REQUIREMENTS.maxPreviewStickers,
          },
        ],
        as: "previewStickers",
      },
    },
    {
      $sort: { trendingScore: -1 },
    },
    {
      $limit: 10,
    },
  ];

  const packs = await StickerPack.aggregate(pipeline);
  return packs.map((pack) => PackPreviewFormatter.toPackPreview(pack));
};

const getSuggestedPacks = async (
  page: number,
  limit: number,
  userId?: string
): Promise<{ packs: IPackPreview[]; total: number }> => {
  const skip = (page - 1) * limit;
  let userPreferences = null;

  if (userId) {
    userPreferences = await analyzeUserPreferences(userId);
  }

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
          "creator._id": { $ne: new Types.ObjectId(userId) },
        }),
      },
    },
    {
      $lookup: {
        from: "stickers",
        let: { stickerIds: "$stickers" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$stickerIds"] },
            },
          },
        ],
        as: "allStickers",
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
                    $cond: {
                      if: {
                        $in: [
                          "$creator._id",
                          userPreferences.favoriteCreators.map(
                            (id) => new Types.ObjectId(id)
                          ),
                        ],
                      },
                      then: 300,
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
                      then: 150,
                      else: 0,
                    },
                  },
                  {
                    $multiply: [
                      {
                        $size: {
                          $setIntersection: [
                            "$allStickers.tags",
                            Object.keys(userPreferences.favoriteTags).slice(
                              0,
                              10
                            ),
                          ],
                        },
                      },
                      30,
                    ],
                  },
                ]
              : []),
          ],
        },
      },
    },
    {
      $lookup: {
        from: "stickers",
        let: { stickerIds: "$stickers" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$stickerIds"] },
            },
          },
          {
            $sort: { position: 1 },
          },
          {
            $limit: PACK_REQUIREMENTS.maxPreviewStickers,
          },
        ],
        as: "previewStickers",
      },
    },
    {
      $sort: { suggestionScore: -1 },
    },
    {
      $skip: skip,
    },
    {
      $limit: limit,
    },
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
        "creator._id": { $ne: new Types.ObjectId(userId) },
      }),
    }),
  ]);

  return {
    packs: packs.map((pack) => PackPreviewFormatter.toPackPreview(pack)),
    total: totalCount,
  };
};

export const getForYou = async (req: Request, res: Response) => {
  try {
    const validationErrors = await validateRequest(
      req,
      res,
      getForYouValidationRules
    );

    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid parameters",
        errorCode: "INVALID_PARAMETERS",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: validationErrors,
        status: 400,
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const userId = req.user?.id;

    const [recommended, trending, suggested] = await Promise.all([
      getRecommendedPacks(userId),
      getTrendingPacks(userId),
      getSuggestedPacks(page, limit, userId),
    ]);

    const totalPages = Math.ceil(suggested.total / limit);

    const response: ForYouResponse = {
      recommended,
      trending,
      suggested: {
        packs: suggested.packs,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalPages,
          totalItems: suggested.total,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };

    return sendSuccessResponse({
      res,
      message: "For You content retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("Get For You content error:", error);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        error instanceof Error ? error.message : "An unexpected error occurred",
      status: 500,
    });
  }
};
