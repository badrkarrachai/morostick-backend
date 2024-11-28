// app.ts
import express from "express";
import config from "./config";
import startLoaders from "./loaders";

async function startServer() {
  const app = express();

  // Load other application loaders
  await startLoaders({ app });

  // Start the server
  app
    .listen(config.app.port, () => {
      console.log(`server running on port ${config.app.port}`);
    })
    .on("error", (error: Error) => {
      console.error(`Server startup error: ${error.message}`);
      process.exit(1);
    });
}

startServer();
