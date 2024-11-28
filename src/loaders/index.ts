import connectDB from "./db_loader";
import expressLoader from "./express_loader";
import type { Express } from "express";

export default async function ({ app }: { app: Express }) {
  await connectDB();
  console.log("Mongodb loaded");

  await expressLoader({ app });
  console.log("Express loaded");
}
