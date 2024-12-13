import expressLoader from "./express_loader";
import type { Express } from "express";

export default async function ({ app }: { app: Express }) {
  await expressLoader({ app });
  console.log("✅ Express loaded");
}
