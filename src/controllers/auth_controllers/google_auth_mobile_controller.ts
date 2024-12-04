import { Request, Response } from "express";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import User from "../../models/users_model";
import Image from "../../models/image_model";
import bcrypt from "bcrypt";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import config from "../../config";
import { checkAccountRecoveryStatus } from "../../utils/account_deletion_check_util";
import { formatUserData } from "../../utils/responces_templates/user_auth_response_template";
import { sendWelcomeEmail } from "../../utils/email_sender_util";
import { prepareMobileAuthResponse } from "../../utils/jwt_util";

// Update config structure to match existing configuration
interface GoogleConfig {
  clientID: string;
  mobileClientID: string;
  clientSecret: string;
}

const googleClient = new OAuth2Client({
  clientId: config.google.mobileClientID, // Use mobile client ID as default
});

interface GoogleAuthRequest extends Request {
  body: {
    idToken: string;
  };
}

export const handleMobileGoogleAuth = async (
  req: GoogleAuthRequest,
  res: Response
) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return sendErrorResponse({
        res,
        message: "ID token is required",
        errorCode: "INVALID_TOKEN",
        errorDetails: "No ID token provided",
        status: 400,
      });
    }

    let payload: TokenPayload;
    try {
      // Try verifying with both client IDs
      const ticket = await googleClient.verifyIdToken({
        idToken,
      });

      payload = ticket.getPayload() as TokenPayload;
      if (!payload) {
        throw new Error("Invalid token payload");
      }
    } catch (verificationError) {
      return sendErrorResponse({
        res,
        message: "Token verification failed",
        errorCode: "TOKEN_VERIFICATION_FAILED",
        errorDetails: verificationError.message,
        status: 401,
      });
    }

    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return sendErrorResponse({
        res,
        message: "Email not found in Google profile",
        errorCode: "INVALID_PROFILE",
        errorDetails: "No email found in Google profile",
        status: 400,
      });
    }

    let user = await User.findOne({ email });
    let messagesForUser: string[] = [];

    if (user) {
      // Update existing user
      user.googleId = googleId;
      user.name = user.name || name || "";
      user.emailVerified = true;
      user.authProvider = "google";
      user.lastLogin = new Date();

      // Update avatar if not set and picture is available
      if (!user.avatar && picture) {
        const newAvatar = new Image({
          userId: user.id,
          name: `${user.name}'s avatar`,
          url: picture,
        });

        const savedAvatar = await newAvatar.save();
        user.avatar = savedAvatar.id;
      }

      await user.save();
    } else {
      // Create new user
      const randomPassword = await generateRandomPassword();
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = new User({
        name: name || "",
        email,
        googleId,
        emailVerified: true,
        password: hashedPassword,
        authProvider: "google",
      });

      await user.save();

      // Create and save the new avatar if picture is available
      if (picture) {
        const newAvatar = new Image({
          userId: user.id,
          name: `${name}'s avatar`,
          url: picture,
        });
        const savedAvatar = await newAvatar.save();
        user.avatar = savedAvatar.id;
        await user.save();
      }

      // Send welcome email to the user
      sendWelcomeEmail(user);
    }

    // Check account status
    if (!user.isActivated) {
      return sendErrorResponse({
        res,
        message: "Your account is disabled",
        errorCode: "ACCOUNT_DISABLED",
        errorDetails:
          "Account is not activated, please contact the support team.",
        status: 403,
      });
    }

    // Check account recovery status
    const recoveryMessage = checkAccountRecoveryStatus(
      user,
      config.app.recoveryPeriod,
      res
    );
    if (recoveryMessage === "deleted") {
      return sendErrorResponse({
        res,
        message: "Account has been permanently deleted",
        errorCode: "ACCOUNT_DELETED",
        errorDetails:
          "The recovery period has ended. Your account is scheduled for permanent deletion.",
        status: 403,
      });
    }
    if (recoveryMessage) {
      messagesForUser.push(recoveryMessage);
    }

    // Generate JWT token
    const tokens = prepareMobileAuthResponse(user);

    // Format user data
    const userData = await formatUserData(user, messagesForUser);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Send success response
    return sendSuccessResponse({
      res,
      message: "Google authentication successful",
      data: {
        ...tokens,
        user: userData,
      },
      status: 200,
    });
  } catch (error) {
    return sendErrorResponse({
      res,
      message: "Authentication failed",
      errorCode: "AUTH_FAILED",
      errorDetails: `Authentication error: ${error.message}`,
      status: 500,
    });
  }
};

// Helper function to generate a random password
async function generateRandomPassword(): Promise<string> {
  const length = 16;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let password = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  return password;
}
