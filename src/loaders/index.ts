// loaders/index.ts
import expressLoader from "./express_loader";
import type { Express } from "express";

export default async function (app: Express) {
  await expressLoader({ app });
  console.log("✅ Express loaded");
}
