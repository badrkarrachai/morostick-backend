import { body, ValidationChain, validationResult } from "express-validator";
import { sendErrorResponse } from "./response_handler_util";
import { Request, Response } from "express";
import { Types } from "mongoose";

// Common validation rules
const validationRules = {
  name: body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be 2-50 characters long"),
  email: body("email")
    .trim()
    .isEmail()
    .withMessage("Please include a valid email")
    .isLength({ max: 250 })
    .withMessage("Email must not exceed 250 characters"),
  password: body("password")
    .exists()
    .withMessage("Password is required")
    .isLength({ min: 6, max: 250 })
    .withMessage("Password must be at least 6 characters"),
  confirmPassword: body("confirmPassword")
    .exists()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
  otp: body("otp", "Code is required")
    .exists()
    .isString()
    .isLength({ min: 5, max: 5 })
    .withMessage("Code must be 5 digits long"),
  currentPassword: body("currentPassword")
    .exists()
    .withMessage("Current password is required")
    .isLength({ min: 6, max: 250 })
    .withMessage("Current password must be at least 6 characters"),
  newPassword: body("newPassword")
    .exists()
    .withMessage("New password is required")
    .isLength({ min: 6, max: 250 })
    .withMessage("New password must be at least 6 characters"),
  newPasswordConfirm: body("confirmNewPassword")
    .exists()
    .withMessage("Confirm new password is required")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("New passwords do not match");
      }
      return true;
    }),
  currentEmail: body("currentEmail")
    .trim()
    .isEmail()
    .withMessage("Please include a valid current email")
    .isLength({ max: 250 })
    .withMessage("Current email must not exceed 250 characters"),
  reasons: body("reasons")
    .exists()
    .withMessage("Reasons are required")
    .isArray()
    .withMessage("Reasons must be an array"),
};

// Validation rule sets for specific routes
export const registrationValidationRules = [
  validationRules.name,
  validationRules.email,
  validationRules.password,
];
// Login validation rules
export const loginValidationRules = [
  validationRules.email,
  validationRules.password,
];
// Request password reset validation rules
export const requestPasswordResetValidationRules = [validationRules.email];
// Reset password validation rules
export const resetPasswordValidationRules = [
  validationRules.email,
  validationRules.otp,
  validationRules.newPassword,
  validationRules.newPasswordConfirm,
];
// Verify Code validation rules
export const verifyOtpValidationRules = [
  validationRules.otp,
  validationRules.email,
];
// Request update profile email validation rules
export const updateProfileEmailValidationRules = [
  validationRules.email,
  validationRules.currentEmail,
  validationRules.currentPassword,
];
// Update profile email via Code validation rules
export const updateProfileEmailViaOTPValidationRules = [
  validationRules.email,
  validationRules.currentEmail,
  validationRules.otp,
];
// Update profile name validation rules
export const updateProfileNameValidationRules = [
  validationRules.email,
  validationRules.name,
];
// Update profile password validation rules
export const updateProfilePasswordValidationRules = [
  validationRules.email,
  validationRules.currentPassword,
  validationRules.newPassword,
  validationRules.newPasswordConfirm,
];
// Delete account validation rules
export const requesteleteAccountValidationRules = [validationRules.reasons];
// Request Verify email validation rules
export const requestverifyEmailValidationRules = [validationRules.email];
// verify email validation rules
export const verifyEmailValidationRules = [
  validationRules.email,
  validationRules.otp,
];

// Call method to validate
export const validateRequest = async (
  req: Request,
  res: Response,
  validationRules: ValidationChain[]
) => {
  await Promise.all(validationRules.map((validation) => validation.run(req)));

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errors.array()[0].msg;
  }
  return "validation successful";
};
