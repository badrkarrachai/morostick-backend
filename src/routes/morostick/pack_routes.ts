import { Router } from "express";

import { auth } from "../middlewares/auth_middleware";
import { checkAccountNotDeleted } from "../middlewares/check_account_deleted_middleware";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import { createPack } from "../../controllers/sticker_controllers/packes/create_pack_controller";
import { deletePack } from "../../controllers/sticker_controllers/packes/delete_pack_controller";
import { updatePack } from "../../controllers/sticker_controllers/packes/update_pack_controller";
import {
  moveSticker,
  moveStickerValidationRules,
  reorderStickers,
  reorderStickersValidationRules,
} from "../../controllers/sticker_controllers/packes/reorder_stickers_controller";

const router = Router();

// Reuse your middleware array
const checkAD = [checkAccountNotDeleted, checkAccountActivated];

// Pack creation route
router.post("/create", auth, checkAD, createPack);
router.delete("/delete/:packId", auth, checkAD, deletePack);
router.post("/update/:packId", auth, checkAD, updatePack);

// Reorder stickers route
router.post(
  "/reorder/:packId",
  auth,
  checkAD,
  reorderStickersValidationRules,
  reorderStickers
);
router.post(
  "/move-sticker/:packId",
  auth,
  checkAD,
  moveStickerValidationRules,
  moveSticker
);

export default router;
