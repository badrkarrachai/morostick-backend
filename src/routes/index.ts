import { Router } from "express";
import moroStickRoutes from "./morostick/index";

const router = Router();

router.use("/", moroStickRoutes);

export default router;
