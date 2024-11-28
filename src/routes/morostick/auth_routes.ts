import { Router } from "express";
import { check, validationResult } from "express-validator";
import { register } from "../../controllers/auth_controllers/register_controller";
import { login } from "../../controllers/auth_controllers/login_controller";
import {
  requestPasswordReset,
  resetPassword,
} from "../../controllers/auth_controllers/reset_password_controller";
import { rateLimiterGeneral } from "../../utils/rate_limiter_util";
import { verifyOTP } from "../../controllers/auth_controllers/verify_otp";

import { me } from "../../controllers/auth_controllers/me_controller";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import { auth } from "../middlewares/auth_middleware";
import { refreshToken } from "../../controllers/auth_controllers/refresh_token_controller";
import { logout } from "../../controllers/auth_controllers/logout_controller";
import { handleMobileGoogleAuth } from "../../controllers/auth_controllers/google_auth_mobile_controller";
import { handleFacebookMobileAuth } from "../../controllers/auth_controllers/facebook_auth_mobile";

const router = Router();

router.post("/login", rateLimiterGeneral, login);
router.post("/register", rateLimiterGeneral, register);
router.post(
  "/reset-password-request",
  rateLimiterGeneral,
  requestPasswordReset
);
router.post("/verify-otp", rateLimiterGeneral, verifyOTP);
router.post("/reset-password", rateLimiterGeneral, resetPassword);
router.post("/google/mobile", rateLimiterGeneral, handleMobileGoogleAuth);
router.post("/facebook/mobile", rateLimiterGeneral, handleFacebookMobileAuth);
router.get("/me", auth, checkAccountActivated, me);
router.post("/refresh-token", refreshToken);
router.post("/logout", auth, logout);

export default router;
