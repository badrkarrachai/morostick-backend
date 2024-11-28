import { Request, Response } from "express";
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
import { prepareJWTTokensForAuth } from "../../utils/jwt_util";
import axios, { AxiosResponse } from "axios";
import { Types } from "mongoose";

// Define interfaces for type safety
interface FacebookAuthRequest extends Request {
  body: {
    accessToken: string;
  };
}

interface FacebookUserData {
  id: string;
  email: string | undefined;
  name: string | undefined;
  picture?: {
    data: {
      url: string;
    };
  };
}

interface FacebookApiResponse {
  data: FacebookUserData;
}

interface FacebookAppResponse {
  data: {
    id: string;
  };
}

/**
 * Handle Facebook mobile authentication
 * @param req Request object containing Facebook access token
 * @param res Response object
 */
export const handleFacebookMobileAuth = async (
  req: FacebookAuthRequest,
  res: Response
) => {
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

    // Verify Facebook token and get user data
    let facebookData: FacebookUserData;
    try {
      const response: AxiosResponse<FacebookUserData> = await axios.get(
        `https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.type(large)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      facebookData = response.data;

      // Verify the token belongs to your app
      const appVerification: AxiosResponse<{ id: string }> = await axios.get(
        `https://graph.facebook.com/app?access_token=${accessToken}`
      );

      if (appVerification.data.id !== config.facebook.appID) {
        throw new Error("Invalid application ID");
      }
    } catch (error) {
      console.error("Facebook verification error:", error);
      return sendErrorResponse({
        res,
        message: "Failed to verify Facebook token",
        errorCode: "VERIFICATION_FAILED",
        errorDetails: error instanceof Error ? error.message : "Unknown error",
        status: 401,
      });
    }

    const { id: facebookId, email, name, picture } = facebookData;

    if (!email) {
      return sendErrorResponse({
        res,
        message: "Email not provided by Facebook",
        errorCode: "EMAIL_REQUIRED",
        errorDetails: "Email permission is required for authentication",
        status: 400,
      });
    }

    let user = await User.findOne({ email });
    const messagesForUser: string[] = [];

    if (user) {
      // Update existing user
      user.facebookId = facebookId;
      user.name = user.name || name || "";
      user.emailVerified = true;
      user.authProvider = "facebook";
      user.lastLogin = new Date();

      // Update profile picture if not set
      if (!user.avatar && picture?.data?.url) {
        const newAvatar = new Image({
          userId: user._id,
          name: `${user.name}'s avatar`,
          url: picture.data.url,
          provider: "facebook",
        });

        const savedAvatar = await newAvatar.save();
        user.avatar = savedAvatar._id as Types.ObjectId;
      }

      await user.save();
    } else {
      // Create new user
      const randomPassword = await bcrypt.hash(
        Math.random().toString(36).slice(-8),
        10
      );

      user = new User({
        name: name || "",
        email,
        facebookId,
        emailVerified: true,
        password: randomPassword,
        authProvider: "facebook",
        isActivated: true,
        lastLogin: new Date(),
      });

      await user.save();

      // Save profile picture
      if (picture?.data?.url) {
        const newAvatar = new Image({
          userId: user._id,
          name: `${user.name}'s avatar`,
          url: picture.data.url,
          provider: "facebook",
        });

        const savedAvatar = await newAvatar.save();
        user.avatar = savedAvatar._id as Types.ObjectId;
        await user.save();
      }

      // Send welcome email
      await sendWelcomeEmail(user);
    }

    // Check if account is activated
    if (!user.isActivated) {
      return sendErrorResponse({
        res,
        message: "Account is disabled",
        errorCode: "ACCOUNT_DISABLED",
        errorDetails: "Please contact support to activate your account",
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
        errorDetails: "The recovery period has ended",
        status: 403,
      });
    }

    if (recoveryMessage) {
      messagesForUser.push(recoveryMessage);
    }

    // Generate authentication tokens
    const authTokens = prepareJWTTokensForAuth(user, res);

    // Format user data for response
    const userData = await formatUserData(user, messagesForUser);

    // Send success response
    return sendSuccessResponse({
      res,
      message: "Facebook authentication successful",
      data: {
        accessToken: authTokens, // Just send the access token
        user: userData,
      },
      status: 200,
    });
  } catch (error) {
    console.error("Facebook authentication error:", error);
    return sendErrorResponse({
      res,
      message: "Authentication failed",
      errorCode: "AUTH_FAILED",
      errorDetails: error instanceof Error ? error.message : "Unknown error",
      status: 500,
    });
  }
};
