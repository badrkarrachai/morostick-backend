import { Router } from "express";
import {
  getForYou,
  getForYouValidationRules,
} from "../../controllers/home_controllers/for_you_tab_controller";

const router = Router();

router.get("/for-you", getForYouValidationRules, getForYou);

export default router;
