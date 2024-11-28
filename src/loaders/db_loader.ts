import mongoose from "mongoose";
import config from "../config";

const connectDB = async () => {
  try {
    if (!config.mongodb.url) {
      throw new Error(
        "MONGODB_URI is not defined in the environment variables."
      );
    }
    await mongoose.connect(config.mongodb.url);
  } catch (err) {
    return err;
  }
};

export default connectDB;
