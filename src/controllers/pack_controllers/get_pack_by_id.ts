import { Request, Response } from "express";
import { query } from "express-validator";
import { StickerPack } from "../../models/pack_model";
import { validateRequest } from "../../utils/validations_util";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { transformPack } from "../../utils/responces_templates/response_views_transformer";
import User from "../../models/users_model";
import { Types } from "mongoose";
import { extractToken } from "../../routes/middlewares/auth_middleware";
import { verifyAccessToken } from "../../utils/jwt_util";

// Validation rules for getting a pack
export const getPackByIdValidationRules = [query("id").isMongoId().withMessage("Invalid pack ID format")];

export const getPackById = async (req: Request, res: Response) => {
  try {
    // Validate request
    const validationErrors = await validateRequest(req, res, getPackByIdValidationRules);

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

    const packId = req.query.id as string;
    // Get user ID if authenticated
    // Extract and validate token
    let userId;
    try {
      if (req.header("Authorization") !== undefined) {
        const token = extractToken(req.header("Authorization"));
        // Verify access token
        const decoded = await verifyAccessToken(token);
        userId = (req.user = decoded.user).id;
      }
    } catch (error) {}

    // Find the pack with visibility conditions
    const pack = await StickerPack.findOne({
      _id: packId,
      $or: [{ isPrivate: false }, { isPrivate: true, isAuthorized: true }],
    });

    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist or is not accessible.",
        status: 404,
      });
    }

    // Record view anonymously
    try {
      await pack.recordView({});
    } catch (error) {
      console.error("Error recording view:", error);
      // Continue execution even if view recording fails
    }

    // Transform the pack with all details
    const packView = await transformPack(pack, {
      includeStickers: true,
      includeTotalCount: true,
      stickersLimit: 30,
      userId: userId,
      useCache: false,
    });

    // Check if pack is in user's favorites
    const isFavorite = userId
      ? (await User.exists({
          _id: userId,
          favoritesPacks: new Types.ObjectId(packId),
        })) !== null
      : false;

    return sendSuccessResponse({
      res,
      message: "Pack retrieved successfully",
      data: {
        ...packView,
        isFavorite,
      },
    });
  } catch (err) {
    console.error("Get pack error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: err.message || "An unexpected error occurred while retrieving the pack.",
      status: 500,
    });
  }
};
