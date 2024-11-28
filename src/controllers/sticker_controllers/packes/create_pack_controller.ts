import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { PACK_REQUIREMENTS } from "../../../interfaces/pack_interface";
import { IPackPreview } from "../../../interfaces/pack_interface";
import { body } from "express-validator";
import User from "../../../models/users_model";
import { IUser } from "../../../interfaces/user_interface";
import { IImages } from "../../../interfaces/image_interface";
import { PackPreviewFormatter } from "../../../utils/responces_templates/pack_response_template";

// Add type for authenticated request

export const createPack = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { name, description, tags, isAnimatedPack, isPrivate } = req.body;

  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      createPackValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: validationErrors,
        status: 400,
      });
    }

    // Sanitize and validate tags
    const sanitizedTags = tags ? tags.slice(0, PACK_REQUIREMENTS.maxTags) : [];

    // Find user and populate avatar
    const user = await User.findById(userId).populate<{ avatar: IImages }>(
      "avatar"
    );
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails:
          "There is no session with this user id, please login again.",
        status: 404,
      });
    }

    // Create the pack with proper type checking
    const pack = new StickerPack({
      name: name.trim(),
      description: description?.trim(),
      creator: {
        _id: userId,
        username: user.name,
        avatarUrl: user.avatar?.url || undefined,
      },
      tags: sanitizedTags,
      stickers: [],
      isPrivate: isPrivate,
      isAnimatedPack: isAnimatedPack,
      stats: {
        downloads: 0,
        views: 0,
        favorites: 0,
      },
    });

    // Save the pack
    await pack.save();

    return sendSuccessResponse<IPackPreview>({
      res,
      status: 201,
      message: "Sticker pack created successfully",
      data: PackPreviewFormatter.toPackPreview(pack),
    });
  } catch (err) {
    console.error("Pack creation error:", err);

    // Check for specific MongoDB errors
    if (err.code === 11000) {
      return sendErrorResponse({
        res,
        message: "Pack name already exists",
        errorCode: "DUPLICATE_PACK_NAME",
        errorDetails:
          "A pack with this name already exists. Please choose a different name.",
        status: 409,
      });
    }

    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while creating the pack. Please try again later.",
      status: 500,
    });
  }
};

// Validation rules
export const createPackValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Pack name is required")
    .isLength({ max: PACK_REQUIREMENTS.nameMaxLength })
    .withMessage(
      `Pack name cannot exceed ${PACK_REQUIREMENTS.nameMaxLength} characters`
    ),
  body("description")
    .optional()
    .trim()
    .isLength({ max: PACK_REQUIREMENTS.descriptionMaxLength })
    .withMessage(
      `Description cannot exceed ${PACK_REQUIREMENTS.descriptionMaxLength} characters`
    ),
  body("tags")
    .optional()
    .isArray()
    .withMessage("Tags must be an array")
    .custom((tags) => tags.length <= PACK_REQUIREMENTS.maxTags)
    .withMessage(`Maximum ${PACK_REQUIREMENTS.maxTags} tags allowed`),
  body("isAnimatedPack")
    .optional()
    .isBoolean()
    .withMessage("Invalid animation type"),
  body("isPrivate")
    .exists()
    .withMessage("Private pack status is required")
    .isBoolean()
    .withMessage("Invalid private pack status"),
];
