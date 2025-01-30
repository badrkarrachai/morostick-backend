import { Router } from "express";
import { auth } from "../middlewares/auth_middleware";
import { checkAccountNotDeleted } from "../middlewares/check_account_deleted_middleware";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import wrapAsync from "../../utils/async_handler_util";
import { uploadSticker } from "../../controllers/sticker_controllers/upload_sticker_controller";
import { bulkDeleteStickers, deleteSticker } from "../../controllers/sticker_controllers/delete_sticker_controller";
import { uploadStickerFile } from "../middlewares/sticker_upload_middleware";
import { addStickerToFavorites, addStickerToFavoritesValidationRules } from "../../controllers/sticker_controllers/toggle_sticker_favorite";
import { bulkUploadStickers } from "../../controllers/sticker_controllers/upload_many_stickers_controller";

const router = Router();
const checkAD = [checkAccountNotDeleted, checkAccountActivated];

// Wrap the upload middleware in an error handler

// CRUD routes
router.post("/upload/:packId", auth, checkAD, uploadStickerFile, wrapAsync(uploadSticker));
router.post("/upload/bulk/:packId", auth, checkAD, bulkUploadStickers);
router.delete("/delete/:stickerId", auth, checkAD, wrapAsync(deleteSticker));
router.delete("/bulk-delete/:packId", auth, checkAD, wrapAsync(bulkDeleteStickers));

// Other sticker routes
router.post("/favorite-toggle", auth, checkAD, addStickerToFavoritesValidationRules, addStickerToFavorites);

export default router;
