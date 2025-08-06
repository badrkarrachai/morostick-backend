import { Request, Response } from "express";
import { Report } from "../../models/report_model";
import { StickerPack } from "../../models/pack_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { body, query } from "express-validator";
import { Types } from "mongoose";
import User from "../../models/users_model";

export const createPackReportValidationRules = [
  query("packId").isMongoId().withMessage("Invalid pack ID"),
  body("reason")
    .trim()
    .notEmpty()
    .withMessage("Reason is required")
    .isLength({ min: 1, max: 500 })
    .withMessage("Reason must be between 1 and 500 characters"),
];

export const createPackReport = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { packId } = req.query;
    const { reason } = req.body;

    // Validate request
    const validationErrors = await validateRequest(req, res, createPackReportValidationRules);
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

    // Check if pack exists
    const pack = await StickerPack.findById(packId);
    if (!pack) {
      return sendErrorResponse({
        res,
        message: "Pack not found",
        errorCode: "PACK_NOT_FOUND",
        errorDetails: "The specified pack does not exist",
        status: 404,
      });
    }

    // Check for existing unresolved report from the same user
    const existingReport = await Report.findOne({
      userId: new Types.ObjectId(userId),
      packId: new Types.ObjectId(packId as string),
      stickerId: { $exists: false },
      isResolved: false,
    });

    if (existingReport) {
      return sendErrorResponse({
        res,
        message: "Duplicate report",
        errorCode: "DUPLICATE_REPORT",
        errorDetails: "You already have an active report for this pack",
        status: 409,
      });
    }

    // Start a session for transaction
    const session = await Report.startSession();
    session.startTransaction();

    try {
      // Create new report
      const report = new Report({
        userId: new Types.ObjectId(userId),
        packId: new Types.ObjectId(packId as string),
        reason: reason.trim(),
        isResolved: false,
      });

      await report.save({ session });

      // Add pack to user's hidden packs if not already hidden
      await User.findByIdAndUpdate(
        userId,
        {
          $addToSet: { hiddenPacks: new Types.ObjectId(packId as string) },
        },
        { session }
      );

      await session.commitTransaction();

      // Transform the report for response
      const reportResponse = {
        id: report._id,
        packId: report.packId,
        reason: report.reason,
        createdAt: report.createdAt,
        status: report.isResolved ? "resolved" : "pending",
      };

      return sendSuccessResponse({
        res,
        status: 201,
        message: "Pack report submitted successfully and added to hidden packs",
        data: reportResponse,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error("Pack report creation error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred while creating the pack report",
      status: 500,
    });
  }
};
