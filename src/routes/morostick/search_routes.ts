import { Router } from "express";
import { searchPacks, searchPacksValidationRules } from "../../controllers/serach_controllers/search_pack_controller";
import { getTrendingSearches } from "../../controllers/serach_controllers/trending_searches";

const router = Router();

router.get("/", searchPacksValidationRules, searchPacks);
router.get("/trending-searches", getTrendingSearches);

export default router;
