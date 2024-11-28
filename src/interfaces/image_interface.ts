import { Document, Types } from "mongoose";

export interface IImages extends Document {
  userId: Types.ObjectId;
  name: string;
  url: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
