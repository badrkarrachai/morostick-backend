import { Request, Response } from "express";
import User from "../../models/users_model";
import bcrypt from "bcrypt";
import validator from "validator";
import { sendWelcomeEmail } from "../../utils/email_sender_util";
import config from "../../config";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import {
  registrationValidationRules,
  validateRequest,
} from "../../utils/validations_util";
import { formatUserData } from "../../utils/responces_templates/user_auth_response_template";
import {
  generateAccessToken,
  generateRefreshToken,
  prepareJWTTokensForAuth,
} from "../../utils/jwt_util";
import { IUser } from "../../interfaces/user_interface";

export const register = async (req: Request, res: Response) => {
  try {
    let messagesForUser: string[] = [];

    // Validation
    const validationErrors = await validateRequest(
      req,
      res,
      registrationValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorDetails: validationErrors,
        status: 400,
      });
    }

    // Get the data from the request body
    const { name, email, password } = req.body;

    // Sanitize the email and name
    const sanitizedEmail = validator.normalizeEmail(email) || "";
    const sanitizedName = validator.escape(name);

    // Check if the user already exists
    const existingUser = await User.findOne({ email: sanitizedEmail });
    if (existingUser) {
      return sendErrorResponse({
        res,
        message: "User already exists",
        errorCode: "USER_ALREADY_EXISTS",
        errorDetails: "A user with this email address is already registered.",
        status: 400,
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, config.bcrypt.rounds);

    // Create a new user
    const newUser = new User({
      name: sanitizedName,
      email: sanitizedEmail,
      password: hashedPassword,
    });
    await newUser.save();

    // Check if user email is verified
    if (!newUser.emailVerified) {
      messagesForUser.push("Please verify your email to use full features.");
    }

    // Send a welcome email to the user
    sendWelcomeEmail(newUser);

    // Prepare user data for the response
    const userData = await formatUserData(newUser, messagesForUser);

    // Generate JWT tokens
    const accessToken = prepareJWTTokensForAuth(newUser, res);

    // Send response
    return sendSuccessResponse({
      res,
      message: "Registration successful",
      data: {
        accessToken,
        user: userData,
      },
      status: 201,
    });
  } catch (err) {
    console.error("Registration error:", err);
    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails: "An unexpected error occurred. Please try again later.",
      status: 500,
    });
  }
};
