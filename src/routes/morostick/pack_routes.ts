import { Router } from "express";

import { auth } from "../middlewares/auth_middleware";
import { checkAccountNotDeleted } from "../middlewares/check_account_deleted_middleware";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import { createPack } from "../../controllers/pack_controllers/create_pack_controller";
import { deletePack } from "../../controllers/pack_controllers/delete_pack_controller";
import { updatePack } from "../../controllers/pack_controllers/update_pack_controller";
import {
  moveSticker,
  moveStickerValidationRules,
  reorderStickers,
  reorderStickersValidationRules,
} from "../../controllers/pack_controllers/reorder_stickers_controller";
import { getPackById } from "../../controllers/pack_controllers/get_pack_by_id";
import { addPackToFavorites, addPackToFavoritesValidationRules } from "../../controllers/pack_controllers/toggle_pack_favorite";
import { createPackReport, createPackReportValidationRules } from "../../controllers/pack_controllers/report_pack_controller";
import { hidePack, hidePackValidationRules, unhidePack } from "../../controllers/pack_controllers/hide_pack_controller";

const router = Router();

// Reuse your middleware array
const checkAD = [checkAccountNotDeleted, checkAccountActivated];

// Pack CRUD routes
router.post("/create", auth, checkAD, createPack);
router.delete("/delete/:packId", auth, checkAD, deletePack);
router.post("/update/:packId", auth, checkAD, updatePack);
router.get("/get-by-id", getPackById);

// Other pack routes
router.post("/reorder/:packId", auth, checkAD, reorderStickersValidationRules, reorderStickers);
router.post("/move-sticker/:packId", auth, checkAD, moveStickerValidationRules, moveSticker);
router.post("/favorite-toggle", auth, checkAD, addPackToFavoritesValidationRules, addPackToFavorites);
router.post("/report-create", auth, checkAD, createPackReportValidationRules, createPackReport);
router.post("/hide", auth, hidePackValidationRules, hidePack);
router.post("/unhide", auth, hidePackValidationRules, unhidePack);

export default router;
