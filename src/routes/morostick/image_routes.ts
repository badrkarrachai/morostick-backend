// src/routes/wanaship/image_routes.ts
import { Router } from "express";

import { uploadImage } from "../../controllers/media_controllers/image_controller";
import {
  uploadMultipleImages,
  uploadSingleImage,
} from "../middlewares/upload_middleware";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import { checkEmailVerified } from "../middlewares/check_email_verified_middleware";
import { auth } from "../middlewares/auth_middleware";

const router = Router();

// Route for uploading a single profile picture
router.post(
  "/single",
  auth,
  checkAccountActivated,
  checkEmailVerified,
  (req, res, next) => {
    uploadSingleImage(req, res, (err) =>
      uploadImage("single", err, req, res, next)
    );
  }
);

// Route for uploading multiple parcel images
router.post(
  "/multiple",
  auth,
  checkAccountActivated,
  checkEmailVerified,
  (req, res, next) => {
    uploadMultipleImages(req, res, (err) =>
      uploadImage("multiple", err, req, res, next)
    );
  }
);

export default router;
