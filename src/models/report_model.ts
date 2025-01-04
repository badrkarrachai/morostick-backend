import mongoose, { Schema } from "mongoose";
import { IReport } from "../interfaces/report_interface";

const ReportSchema = new Schema<IReport>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    packId: {
      type: Schema.Types.ObjectId,
      ref: "Pack",
      required: true,
      index: true,
    },
    stickerId: {
      type: Schema.Types.ObjectId,
      ref: "Sticker",
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ReportSchema.index({ userId: 1, packId: 1, stickerId: 1 });
ReportSchema.index({ resolvedBy: 1, isResolved: 1 });
ReportSchema.index({ createdAt: -1 });

export const Report = mongoose.model<IReport>("Report", ReportSchema);
