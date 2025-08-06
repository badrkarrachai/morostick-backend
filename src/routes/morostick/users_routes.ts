import { Router } from "express";
import { requestUpdateUserEmail, updateUserEmailViaOTP } from "../../controllers/users/updating_details/update_user_email_controller";
import { updateUserName } from "../../controllers/users/updating_details/update_user_name_controller";
import { updateUserPassword } from "../../controllers/users/updating_details/update_user_password_controller";
import { deleteUser } from "../../controllers/users/deletion/delete_user_controller";
import { recoverUser } from "../../controllers/users/deletion/recover_user_controller";
import { requestVerifyUserEmail, verifyUserEmailViaOTP } from "../../controllers/users/updating_details/verify_user_email_controller";
import { checkAccountNotDeleted } from "../middlewares/check_account_deleted_middleware";
import { checkAccountActivated } from "../middlewares/check_account_activated_middleware";
import { auth } from "../middlewares/auth_middleware";
import { uploadAvatarFile, uploadCoverImageFile } from "../middlewares/sticker_upload_middleware";
import { deleteUserAvatar, updateUserAvatar } from "../../controllers/users/updating_details/update_user_avatar_controller";
import { updatePreferencesValidationRules, updateUserPreferences } from "../../controllers/auth_controllers/user_preferences";
import { uploadCoverImage } from "../../utils/storage_util";
import { deleteUserCoverImage, updateUserCoverImage } from "../../controllers/users/updating_details/update_user_cover_controller";
import { getUserPacks, getUserPacksValidationRules } from "../../controllers/pack_controllers/get_user_packs_controller";

const router = Router();

const checkAD = [checkAccountNotDeleted, checkAccountActivated];

router.post("/update-user-name", auth, checkAD, updateUserName);
router.post("/update-user-password", auth, checkAD, updateUserPassword);
router.post("/request-update-user-email", auth, checkAD, requestUpdateUserEmail);
router.post("/update-user-email", auth, checkAD, updateUserEmailViaOTP);
router.get("/delete-user", auth, deleteUser);
router.get("/recover-user", auth, recoverUser);
router.post("/request-verify-user-email", auth, checkAD, requestVerifyUserEmail);
router.post("/verify-user-email", auth, checkAD, verifyUserEmailViaOTP);
router.put("/update-profile-picture", auth, uploadAvatarFile, updateUserAvatar);
router.delete("/delete-profile-picture", auth, deleteUserAvatar);
router.patch("/update-user-preferences", auth, checkAD, updatePreferencesValidationRules, updateUserPreferences);
router.put("/update-cover-image", auth, uploadCoverImageFile, updateUserCoverImage);
router.delete("/delete-cover-image", auth, deleteUserCoverImage);

// User packs route - matches frontend expectation
router.get("/get-user-packs", auth, getUserPacksValidationRules, getUserPacks);

export default router;
