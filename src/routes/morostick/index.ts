import { Router } from "express";
import userRoutes from "./users_routes";
import imageRoutes from "./image_routes";
import authRoutes from "./auth_routes";
import stickerRoutes from "./sticker_routes";
import packRoutes from "./pack_routes";
import homeRoutes from "./home_routes";

import { rateLimiterGeneral } from "../../utils/rate_limiter_util";

const router = Router();

router.get("/", rateLimiterGeneral, (req, res) => {
  res.send("Welcome");
});
router.use("/user", userRoutes);
router.use("/auth", authRoutes);
router.use("/upload", imageRoutes);
router.use("/sticker", stickerRoutes);
router.use("/pack", packRoutes);
router.use("/home", homeRoutes);

export default router;
