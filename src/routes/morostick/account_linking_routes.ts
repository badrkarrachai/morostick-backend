import { Router } from "express";
import {
  linkGoogleAccount,
  linkFacebookAccount,
  toggleSocialAccountLogin,
  getLinkedAccounts,
} from "../../controllers/auth_controllers/link_account_controller";
import { auth } from "../middlewares/auth_middleware";

const router = Router();

// Route to get current linked accounts status
router.get("/linked-accounts", auth, getLinkedAccounts);

// Route to link Google account
router.post("/link/google", auth, linkGoogleAccount);

// Route to link Facebook account
router.post("/link/facebook", auth, linkFacebookAccount);

// Route to toggle social account login (enable/disable)
router.patch("/toggle-login", auth, toggleSocialAccountLogin);

export default router;
