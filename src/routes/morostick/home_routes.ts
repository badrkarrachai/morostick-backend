import { Router } from "express";
import {
  getForYou,
  getForYouValidationRules,
} from "../../controllers/home_controllers/foryou_tab_controller";
import {
  getTrending,
  getTrendingValidationRules,
} from "../../controllers/home_controllers/trending_tab_controller";

const router = Router();

router.get("/for-you-tab", getForYouValidationRules, getForYou);
router.get("/trending-tab", getTrendingValidationRules, getTrending);

export default router;
