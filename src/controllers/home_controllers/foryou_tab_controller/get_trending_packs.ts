import { PipelineStage, Types } from "mongoose";
import { PackView } from "../../../interfaces/views_interface";
import User from "../../../models/users_model";
import { StickerPack } from "../../../models/pack_model";
import { transformPacks } from "../../../utils/responces_templates/response_views_transformer";

// Helper function to get a random number within a range
const getRandomInRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Helper function to get a random date within a range
const getRandomDate = (start: Date, end: Date): Date => {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
};

export const getTrendingPacks = async (
  userId?: string
): Promise<PackView[]> => {
  // Randomize the time window between 15 and 45 days
  const randomDays = getRandomInRange(15, 45);
  const dateWindow = new Date();
  dateWindow.setDate(dateWindow.getDate() - randomDays);

  // Randomize weight factors for different metrics
  const downloadWeight = getRandomInRange(8, 12);
  const viewWeight = getRandomInRange(4, 6);
  const favoriteWeight = getRandomInRange(7, 9);
  const timeDecayBase = getRandomInRange(90, 110);

  const pipeline: PipelineStage[] = [
    {
      $match: {
        isPrivate: false,
        isAuthorized: true,
        createdAt: { $gte: dateWindow },
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
        // Add random boost factor
        randomBoost: { $rand: {} },

        // Calculate base metrics with randomized weights
        baseMetrics: {
          $add: [
            {
              $multiply: [{ $ifNull: ["$stats.downloads", 0] }, downloadWeight],
            },
            { $multiply: [{ $ifNull: ["$stats.views", 0] }, viewWeight] },
            {
              $multiply: [{ $ifNull: ["$stats.favorites", 0] }, favoriteWeight],
            },
          ],
        },

        // Calculate time decay with random variation
        timeDecay: {
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
            timeDecayBase,
          ],
        },
      },
    },
    {
      $addFields: {
        // Combine all factors into final trending score
        trendingScore: {
          $add: [
            "$baseMetrics",
            "$timeDecay",
            { $multiply: ["$randomBoost", getRandomInRange(20, 40)] }, // Random boost factor
            {
              // Bonus for packs with balanced metrics
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$stats.downloads", 0] },
                    { $gt: ["$stats.views", 0] },
                    { $gt: ["$stats.favorites", 0] },
                  ],
                },
                then: { $multiply: [{ $rand: {} }, getRandomInRange(10, 20)] },
                else: 0,
              },
            },
            {
              // Time-of-day boost (random variation based on current hour)
              $multiply: [
                { $rand: {} },
                {
                  $mod: [{ $hour: new Date() }, getRandomInRange(5, 15)],
                },
              ],
            },
          ],
        },
      },
    },
    { $sort: { trendingScore: -1 } },
    // Randomize the number of results
    { $limit: getRandomInRange(8, 12) },
  ];

  try {
    const packs = await StickerPack.aggregate(pipeline);

    if (packs.length === 0) {
      // Fallback: Get random recent packs if no trending packs found
      const fallbackPacks = await StickerPack.aggregate([
        {
          $match: {
            isPrivate: false,
            isAuthorized: true,
            createdAt: { $gte: dateWindow },
            ...(userId && {
              _id: {
                $nin: await User.findById(userId)
                  .select("favoritesPacks")
                  .then((u) => u?.favoritesPacks || []),
              },
            }),
          },
        },
        { $sample: { size: getRandomInRange(8, 12) } },
      ]);
      return transformPacks(fallbackPacks);
    }

    // Randomly shuffle the order of equally scored packs
    const shuffledPacks = packs
      .map((pack) => ({
        ...pack,
        shuffleScore: Math.random(),
      }))
      .sort((a, b) => {
        const scoreDiff = b.trendingScore - a.trendingScore;
        // If scores are close (within 5%), use random shuffle score
        return Math.abs(scoreDiff) < b.trendingScore * 0.05
          ? b.shuffleScore - a.shuffleScore
          : scoreDiff;
      });

    return transformPacks(shuffledPacks);
  } catch (error) {
    // Emergency fallback: Get any recent authorized packs
    const emergencyPacks = await StickerPack.aggregate([
      {
        $match: {
          isPrivate: false,
          isAuthorized: true,
        },
      },
      { $sample: { size: getRandomInRange(8, 12) } },
    ]);
    return transformPacks(emergencyPacks);
  }
};
