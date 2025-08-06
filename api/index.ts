import express from "express";
import mongoose from "mongoose";
import config from "../src/config";
import startLoaders from "../src/loaders";

// Create Express app instance
const app = express();

let isInitialized = false;

async function initializeApp() {
  if (isInitialized) return app;

  try {
    // Connect to MongoDB
    if (!config.mongodb.url) {
      throw new Error("MONGODB_URI is not defined");
    }

    await mongoose.connect(config.mongodb.url, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
    });
    console.log("✅ MongoDB Connected");

    // Load other application loaders
    await startLoaders(app);
    console.log("✅ Express app initialized");

    isInitialized = true;
    return app;
  } catch (error) {
    console.error("Failed to initialize app:", error);
    throw error;
  }
}

// Export the handler for Vercel
export default async function handler(req: any, res: any) {
  try {
    const app = await initializeApp();
    return app(req, res);
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
