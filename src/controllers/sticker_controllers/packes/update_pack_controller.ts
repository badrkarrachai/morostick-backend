import { Request, Response } from "express";
import { StickerPack } from "../../../models/pack_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../../utils/response_handler_util";
import { validateRequest } from "../../../utils/validations_util";
import { PACK_REQUIREMENTS } from "../../../interfaces/pack_interface";
import { IPackPreview } from "../../../interfaces/pack_interface";
import { body, param } from "express-validator";
import { PackPreviewFormatter } from "../../../utils/responces_templates/pack_response_template";

export const updatePack = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { packId } = req.params;
  const { name, description, tags, isAnimatedPack, isPrivate } = req.body;

  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      updatePackValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: "The provided data is invalid.",
        status: 400,
      });
    }

    // Find pack
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The requested pack does not exist.",
        status: 404,
      });
    }

    // Check ownership
    if (pack.creator._id.toString() !== userId) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "You do not have permission to update this pack.",
        status: 403,
      });
    }

    // Check if pack can be published
    if (isPrivate !== undefined && isPrivate && pack.stickers.length === 0) {
      return sendErrorResponse({
        res,
        message: "Cannot publish empty pack",
        errorCode: "EMPTY_PACK",
        errorDetails: "Pack must contain at least one sticker to be published.",
        status: 400,
      });
    }

    // Check if pack if it has no stickers to change isAnimatedPack
    if (pack.stickers.length > 0 && isAnimatedPack !== undefined) {
      return sendErrorResponse({
        res,
        message: "Cannot change pack type",
        errorCode: "PRIVATE_PACK_WITH_STICKERS",
        errorDetails: "You cannot change the pack type if it has stickers.",
        status: 400,
      });
    }

    // Update pack fields
    if (name) pack.name = name.trim();
    if (description !== undefined) pack.description = description.trim();
    if (tags) pack.tags = tags.slice(0, PACK_REQUIREMENTS.maxTags);
    if (isPrivate !== undefined) pack.isPrivate = isPrivate;
    if (isAnimatedPack !== undefined) pack.isAnimatedPack = isAnimatedPack;

    // Save changes
    await pack.save();

    // Return updated pack preview
    return sendSuccessResponse<IPackPreview>({
      res,
      message: "Pack updated successfully",
      data: PackPreviewFormatter.toPackPreview(pack),
    });
  } catch (err) {
    console.error("Pack update error:", err);

    if (err.code === 11000) {
      return sendErrorResponse({
        res,
        message: "Pack name already exists",
        errorCode: "DUPLICATE_PACK_NAME",
        errorDetails: "A pack with this name already exists.",
        status: 409,
      });
    }

    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while updating the pack.",
      status: 500,
    });
  }
};

// Validation rules
export const updatePackValidationRules = [
  param("packId").isMongoId().withMessage("Invalid pack ID"),
  body("name")
    .optional()
    .trim()
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
    .optional()
    .isBoolean()
    .withMessage("Invalid private pack status"),
];
