// index.ts
import express from "express";
import mongoose from "mongoose";
import config from "./config";
import startLoaders from "./loaders";

async function connectDB() {
  try {
    if (!config.mongodb.url) {
      throw new Error("MONGODB_URI is not defined");
    }

    await mongoose.connect(config.mongodb.url, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
    });
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

async function startServer() {
  try {
    // Connect to MongoDB first
    await connectDB();

    // Initialize express app
    const app = express();

    // Load other application loaders with the app instance
    await startLoaders(app);

    // Start the server
    app
      .listen(config.app.port, () => {
        console.log(`🚀 Server running on port ${config.app.port}`);
      })
      .on("error", (error: Error) => {
        console.error(`Server startup error: ${error.message}`);
        process.exit(1);
      });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  process.exit(1);
});

startServer();
