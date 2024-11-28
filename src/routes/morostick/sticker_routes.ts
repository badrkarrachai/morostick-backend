import { Router } from "express";
import { auth } from "../middlewares/auth_middleware";
import { checkAccountNotDeleted } from "../middlewares/check_account_deleted_middleware";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import wrapAsync from "../../utils/async_handler_util";
import {
  upload,
  uploadSticker,
} from "../../controllers/sticker_controllers/stickers/upload_sticker_controller";
import multer from "multer";
import { sendErrorResponse } from "../../utils/response_handler_util";
import { GENERAL_REQUIREMENTS } from "../../interfaces/sticker_interface";
import uploadStickerFile from "../middlewares/sticker_upload_middleware";

const router = Router();
const checkAD = [checkAccountNotDeleted, checkAccountActivated];

// Wrap the upload middleware in an error handler

// Sticker routes
router.post(
  "/:packId/stickers",
  auth,
  checkAD,
  uploadStickerFile,
  wrapAsync(uploadSticker)
);

export default router;
