import { Request, Response } from "express";
import { query } from "express-validator";
import { Types } from "mongoose";
import { StickerPack } from "../../models/pack_model";
import User from "../../models/users_model";
import { sendSuccessResponse, sendErrorResponse, PaginationInfo } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { transformPack } from "../../utils/responces_templates/response_views_transformer";

// Validation rules
export const getUserPacksValidationRules = [
  query("userId").optional().isMongoId().withMessage("Invalid user ID format"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50"),
  query("isPrivate").optional().isIn(["true", "false", "all"]).withMessage("isPrivate must be 'true', 'false', or 'all'"),
];

export const getUserPacks = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user.id; // Now guaranteed to exist due to auth middleware
    const { userId, page = 1, limit = 20, isPrivate = "all" } = req.query;

    // Validate request
    const validationErrors = await validateRequest(req, res, getUserPacksValidationRules);
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors) ? validationErrors : undefined,
        errorDetails: Array.isArray(validationErrors) ? validationErrors.join(", ") : validationErrors,
        status: 400,
      });
    }

    // Determine target user ID (if not provided, use current user)
    const targetUserId = userId || currentUserId;

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "The specified user does not exist",
        status: 404,
      });
    }

    // Check permissions for viewing private packs
    const canViewPrivate = currentUserId === targetUserId.toString();

    // Build query based on isPrivate parameter
    const baseQuery: any = {
      creator: new Types.ObjectId(targetUserId as string),
    };

    let query: any = { ...baseQuery };

    // Handle privacy filtering
    if (isPrivate === "true") {
      // Only private packs - requires ownership
      if (!canViewPrivate) {
        return sendErrorResponse({
          res,
          message: "Unauthorized",
          errorCode: "UNAUTHORIZED",
          errorDetails: "You can only view your own private packs",
          status: 403,
        });
      }
      query.isPrivate = true;
    } else if (isPrivate === "false") {
      // Only public packs
      query.isPrivate = false;
    } else if (isPrivate === "all") {
      // All packs - but only show private if owner
      if (!canViewPrivate) {
        query.isPrivate = false;
      }
      // If owner, no additional filter needed (shows both public and private)
    }

    // Calculate pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for the current query
    const totalCount = await StickerPack.countDocuments(query);

    // Get total public and private counts (for statistics)
    const totalPublicQuery = { ...baseQuery, isPrivate: false };
    const totalPrivateQuery = { ...baseQuery, isPrivate: true };

    const [totalPublic, totalPrivate] = await Promise.all([
      StickerPack.countDocuments(totalPublicQuery),
      canViewPrivate ? StickerPack.countDocuments(totalPrivateQuery) : Promise.resolve(0),
    ]);

    // Get packs with pagination
    const packs = await StickerPack.find(query)
      .populate("categories", "name")
      .populate("creator", "name avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Transform packs - pass pack ID to transform function
    const transformedPacks = await Promise.all(
      packs.map((pack) =>
        transformPack(pack._id.toString(), {
          includeStickers: true,
          includeTotalCount: true,
          stickersLimit: 10,
          userId: currentUserId,
          useCache: true,
        })
      )
    );

    // Prepare pagination info
    const paginationInfo: PaginationInfo = {
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      totalItems: totalCount,
      pageSize: limitNum,
      hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
      hasPrevPage: pageNum > 1,
    };

    return sendSuccessResponse({
      res,
      message: "User packs retrieved successfully",
      data: {
        packs: transformedPacks,
        pagination: paginationInfo,
        isOwner: canViewPrivate,
        filter: isPrivate,
        totalPublic,
        totalPrivate: canViewPrivate ? totalPrivate : 0,
      },
    });
  } catch (err) {
    console.error("Get user packs error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while retrieving user packs",
      status: 500,
    });
  }
};
