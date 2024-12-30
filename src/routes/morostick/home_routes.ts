import { Router } from "express";
import {
  getForYou,
  getForYouValidationRules,
} from "../../controllers/home_controllers/foryou_tab_controller";
import {
  getTrending,
  getTrendingValidationRules,
} from "../../controllers/home_controllers/trending_tab_controller";
import { getHomeTabsCategories } from "../../controllers/home_controllers/other_tabs_names_controller";
import {
  getPacksByCategories,
  getPacksByCategoriesValidationRules,
} from "../../controllers/home_controllers/other_tabs_content_controller";

const router = Router();

router.get("/top-category-tabs", getHomeTabsCategories);
router.get("/for-you-tab", getForYouValidationRules, getForYou);
router.get("/trending-tab", getTrendingValidationRules, getTrending);
router.post(
  "/category-packs",
  getPacksByCategoriesValidationRules,
  getPacksByCategories
);

export default router;
