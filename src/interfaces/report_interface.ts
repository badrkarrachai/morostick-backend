import { Document, Types } from "mongoose";

export interface IReport extends Document {
  userId: Types.ObjectId;
  packId: Types.ObjectId;
  stickerId?: Types.ObjectId;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
  isResolved: boolean;
  resolvedAt: Date;
  resolvedBy: Types.ObjectId;
}
