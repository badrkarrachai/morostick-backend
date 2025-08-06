import { getPacksCollections } from "../../controllers/main_canvas_controllers/get_packs_collections_controller";
import wrapAsync from "../../utils/async_handler_util";
import { Router } from "express";

const router = Router();

// Get sticker collections
router.get("/get-admin-chosen-packs", wrapAsync(getPacksCollections));

export default router;
