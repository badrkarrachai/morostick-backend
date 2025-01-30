import { Router } from "express";
import { auth } from "../middlewares/auth_middleware";
import { getFavoritePacks, getFavoritePacksValidationRules } from "../../controllers/favorites_controllers/favorite_packs";
import { getFavoriteStickers, getFavoriteStickersValidationRules } from "../../controllers/favorites_controllers/favorite_stickers";

const router = Router();

router.get("/get-favorite-packs", auth, getFavoritePacksValidationRules, getFavoritePacks);
router.get("/get-favorite-stickers", auth, getFavoriteStickersValidationRules, getFavoriteStickers);

export default router;
