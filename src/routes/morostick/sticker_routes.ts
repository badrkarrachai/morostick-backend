import { Router } from "express";
import { auth } from "../middlewares/auth_middleware";
import { checkAccountNotDeleted } from "../middlewares/check_account_deleted_middleware";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import wrapAsync from "../../utils/async_handler_util";
import { uploadSticker } from "../../controllers/sticker_controllers/stickers/upload_sticker_controller";
import uploadStickerFile from "../middlewares/sticker_upload_middleware";
import {
  bulkDeleteStickers,
  deleteSticker,
} from "../../controllers/sticker_controllers/stickers/delete_sticker_controller";

const router = Router();
const checkAD = [checkAccountNotDeleted, checkAccountActivated];

// Wrap the upload middleware in an error handler

// Sticker routes
router.post(
  "/upload/:packId",
  auth,
  checkAD,
  uploadStickerFile,
  wrapAsync(uploadSticker)
);
router.delete("/delete/:stickerId", auth, checkAD, wrapAsync(deleteSticker));
router.delete(
  "/bulk-delete/:packId",
  auth,
  checkAD,
  wrapAsync(bulkDeleteStickers)
);

export default router;
