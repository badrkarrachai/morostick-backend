import { Request, Response } from "express";
import axios from "axios";
import User from "../../models/users_model";
import Image from "../../models/image_model";
import bcrypt from "bcrypt";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import config from "../../config";
import { checkAccountRecoveryStatus } from "../../utils/account_deletion_check_util";
import { formatUserData } from "../../utils/responces_templates/user_auth_response_template";
import { sendWelcomeEmail } from "../../utils/email_sender_util";
import { prepareMobileAuthResponse } from "../../utils/jwt_util";

interface GoogleAuthRequest extends Request {
  body: {
    accessToken: string;
  };
}

interface GoogleUserData {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

export const handleMobileGoogleAuth = async (req: GoogleAuthRequest, res: Response) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return sendErrorResponse({
        res,
        message: "Access token is required",
        errorCode: "INVALID_TOKEN",
        errorDetails: "No access token provided",
        status: 400,
      });
    }

    // Fetch user info from Google API
    let googleUserData: GoogleUserData;
    try {
      const response = await axios.get<GoogleUserData>("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      googleUserData = response.data;
    } catch (error) {
      return sendErrorResponse({
        res,
        message: "Failed to fetch user info from Google",
        errorCode: "FETCH_USER_FAILED",
        errorDetails: error.message,
        status: 401,
      });
    }

    const { email, name, picture, id: googleId, verified_email } = googleUserData;

    if (!email || !verified_email) {
      return sendErrorResponse({
        res,
        message: "Invalid or unverified email in Google profile",
        errorCode: "INVALID_PROFILE",
        errorDetails: "Email not verified or missing in Google profile",
        status: 400,
      });
    }

    let user = await User.findOne({ email }).populate("avatar");
    let messagesForUser: string[] = [];

    if (user) {
      // Check if the user has allowed google auth
      if (!user.preferences.isGoogleAuthEnabled && user.googleId !== null) {
        return sendErrorResponse({
          res,
          message: "Google authentication is not allowed",
          errorCode: "GOOGLE_AUTH_NOT_ALLOWED",
          errorDetails:
            "Sorry, You disabled Google authentication, Please enable it in your account settings after logging in with a different method.",
          status: 403,
        });
      }

      // Update existing user
      user.googleId = googleId;
      user.name = user.name || name || "";
      user.emailVerified = true;
      user.authProvider = "google";
      user.lastLogin = new Date();
      user.preferences.isGoogleAuthEnabled = true;

      // Update avatar if not set and picture is available
      if (user.avatar === null && picture !== null && picture.trim() !== "") {
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
        errorDetails: "Account is not activated, please contact support.",
        status: 403,
      });
    }

    // Check account recovery status
    const recoveryMessage = checkAccountRecoveryStatus(user, config.app.recoveryPeriod, res);
    if (recoveryMessage === "deleted") {
      return sendErrorResponse({
        res,
        message: "Account has been permanently deleted",
        errorCode: "ACCOUNT_DELETED",
        errorDetails: "Recovery period ended. Account scheduled for deletion.",
        status: 403,
      });
    }
    if (recoveryMessage) {
      messagesForUser.push(recoveryMessage);
    }

    // Generate JWT tokens
    const tokens = prepareMobileAuthResponse(user);

    // Format user data
    const userData = await formatUserData(user, messagesForUser);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

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
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let password = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  return password;
}
