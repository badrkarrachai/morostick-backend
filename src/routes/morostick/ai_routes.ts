import express from "express";
import multer from "multer";
import { detectObject } from "../../controllers/ai_controllers/object_detection_controller";
import { auth } from "../middlewares/auth_middleware";
const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
});

/**
 * @route POST /api/ai/detect-object
 * @desc Detect salient objects in an image using U-2-Net
 * @access Public
 */
router.post("/detect-object", auth, upload.single("image"), detectObject);

export default router;
