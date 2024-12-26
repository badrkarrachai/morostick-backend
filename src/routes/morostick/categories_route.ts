import { Router } from "express";
import {
  createCategory,
  createCategoryValidationRules,
} from "../../controllers/categories_controllers/create_category_controller";

const router = Router();

router.post("/create", createCategoryValidationRules, createCategory);

export default router;
