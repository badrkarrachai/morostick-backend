import { Schema, model, Types } from "mongoose";
import { IImages } from "../interfaces/image_interface";

const imageSchema = new Schema<IImages>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    name: { type: String, required: true },
    url: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

const Image = model<IImages>("Image", imageSchema);
export { IImages };
export default Image;
