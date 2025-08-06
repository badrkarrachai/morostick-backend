import { Request, Response } from "express";
import User from "../../models/users_model";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { validateGoogleIdLinking, validateFacebookIdLinking } from "../../utils/social_account_validation_util";
import axios from "axios";
import config from "../../config";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../../interfaces/jwt_payload_interface";

interface AuthenticatedRequest extends Request {
  user?: JwtPayload["user"];
}

interface LinkGoogleAccountRequest extends AuthenticatedRequest {
  body: {
    accessToken: string;
  };
}

interface LinkFacebookAccountRequest extends AuthenticatedRequest {
  body: {
    accessToken: string;
    isLimitedLogin?: boolean;
  };
}

interface ToggleSocialLoginRequest extends AuthenticatedRequest {
  body: {
    provider: "google" | "facebook";
  };
}

/**
 * Link Google account to existing user account
 */
export const linkGoogleAccount = async (req: LinkGoogleAccountRequest, res: Response) => {
  try {
    const { accessToken } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return sendErrorResponse({
        res,
        message: "User not authenticated",
        errorCode: "NOT_AUTHENTICATED",
        errorDetails: "Please log in to link your Google account",
        status: 401,
      });
    }

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
    let googleUserData;
    try {
      const response = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
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

    const { id: googleId, email: googleEmail, verified_email } = googleUserData;

    if (!googleEmail || !verified_email) {
      return sendErrorResponse({
        res,
        message: "Invalid or unverified email in Google profile",
        errorCode: "INVALID_PROFILE",
        errorDetails: "Email not verified or missing in Google profile",
        status: 400,
      });
    }

    // Validate that this Google ID isn't already linked to another account
    const validation = await validateGoogleIdLinking(googleId, userEmail, res);
    if (!validation.isValid) {
      return validation.errorResponse;
    }

    // Update user with Google ID
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "User account not found",
        status: 404,
      });
    }

    // Check if user already has this Google account linked
    if (user.googleId === googleId) {
      return sendErrorResponse({
        res,
        message: "Google account is already linked",
        errorCode: "ALREADY_LINKED",
        errorDetails: "This Google account is already linked to your account",
        status: 400,
      });
    }

    user.googleId = googleId;
    user.preferences.isGoogleAuthEnabled = true;
    await user.save();

    return sendSuccessResponse({
      res,
      message: "Google account linked successfully",
      data: {
        linkedProviders: {
          google: true,
          facebook: !!user.facebookId,
          apple: !!user.appleId,
        },
        loginPermissions: {
          google: user.preferences.isGoogleAuthEnabled,
          facebook: user.preferences.isFacebookAuthEnabled,
        },
      },
      status: 200,
    });
  } catch (error) {
    return sendErrorResponse({
      res,
      message: "Failed to link Google account",
      errorCode: "LINK_FAILED",
      errorDetails: `Error linking Google account: ${error.message}`,
      status: 500,
    });
  }
};

/**
 * Link Facebook account to existing user account
 */
export const linkFacebookAccount = async (req: LinkFacebookAccountRequest, res: Response) => {
  try {
    const { accessToken, isLimitedLogin } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return sendErrorResponse({
        res,
        message: "User not authenticated",
        errorCode: "NOT_AUTHENTICATED",
        errorDetails: "Please log in to link your Facebook account",
        status: 401,
      });
    }

    if (!accessToken) {
      return sendErrorResponse({
        res,
        message: "Access token is required",
        errorCode: "INVALID_TOKEN",
        errorDetails: "No access token provided",
        status: 400,
      });
    }

    let facebookData;

    if (isLimitedLogin) {
      // Handle OIDC token from Limited Login
      const tokenPayload = jwt.decode(accessToken) as any;

      if (!tokenPayload) {
        return sendErrorResponse({
          res,
          message: "Invalid OIDC token format",
          errorCode: "INVALID_TOKEN",
          errorDetails: "Unable to decode OIDC token",
          status: 400,
        });
      }

      if (tokenPayload.aud !== config.facebook.appID) {
        return sendErrorResponse({
          res,
          message: "Invalid token application",
          errorCode: "INVALID_TOKEN",
          errorDetails: "Token not intended for this application",
          status: 400,
        });
      }

      facebookData = {
        id: tokenPayload.sub,
        email: tokenPayload.email,
      };
    } else {
      // Handle standard access token
      try {
        const response = await axios.get(`https://graph.facebook.com/v19.0/me?fields=id,email`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        facebookData = response.data;

        // Verify the token belongs to your app
        const appVerification = await axios.get(`https://graph.facebook.com/app?access_token=${accessToken}`);
        if (appVerification.data.id !== config.facebook.appID) {
          return sendErrorResponse({
            res,
            message: "Invalid application ID",
            errorCode: "INVALID_APP",
            errorDetails: "Token does not belong to this application",
            status: 401,
          });
        }
      } catch (error) {
        return sendErrorResponse({
          res,
          message: "Failed to fetch user info from Facebook",
          errorCode: "FETCH_USER_FAILED",
          errorDetails: error.message,
          status: 401,
        });
      }
    }

    const { id: facebookId, email: facebookEmail } = facebookData;

    if (!facebookEmail) {
      return sendErrorResponse({
        res,
        message: "Email not provided by Facebook",
        errorCode: "EMAIL_REQUIRED",
        errorDetails: "Email permission is required for authentication",
        status: 400,
      });
    }

    // Validate that this Facebook ID isn't already linked to another account
    const validation = await validateFacebookIdLinking(facebookId, userEmail, res);
    if (!validation.isValid) {
      return validation.errorResponse;
    }

    // Update user with Facebook ID
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "User account not found",
        status: 404,
      });
    }

    // Check if user already has this Facebook account linked
    if (user.facebookId === facebookId) {
      return sendErrorResponse({
        res,
        message: "Facebook account is already linked",
        errorCode: "ALREADY_LINKED",
        errorDetails: "This Facebook account is already linked to your account",
        status: 400,
      });
    }

    user.facebookId = facebookId;
    user.preferences.isFacebookAuthEnabled = true;
    await user.save();

    return sendSuccessResponse({
      res,
      message: "Facebook account linked successfully",
      data: {
        linkedProviders: {
          google: !!user.googleId,
          facebook: true,
          apple: !!user.appleId,
        },
        loginPermissions: {
          google: user.preferences.isGoogleAuthEnabled,
          facebook: user.preferences.isFacebookAuthEnabled,
        },
      },
      status: 200,
    });
  } catch (error) {
    return sendErrorResponse({
      res,
      message: "Failed to link Facebook account",
      errorCode: "LINK_FAILED",
      errorDetails: `Error linking Facebook account: ${error.message}`,
      status: 500,
    });
  }
};

/**
 * Toggle social account login permission (enable/disable login with social account)
 */
export const toggleSocialAccountLogin = async (req: ToggleSocialLoginRequest, res: Response) => {
  try {
    const { provider } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return sendErrorResponse({
        res,
        message: "User not authenticated",
        errorCode: "NOT_AUTHENTICATED",
        errorDetails: "Please log in to toggle social account login",
        status: 401,
      });
    }

    if (!provider || !["google", "facebook"].includes(provider)) {
      return sendErrorResponse({
        res,
        message: "Invalid provider",
        errorCode: "INVALID_PROVIDER",
        errorDetails: "Provider must be one of: google, facebook",
        status: 400,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "User account not found",
        status: 404,
      });
    }

    let currentStatus: boolean;
    let newStatus: boolean;

    // Toggle the login permission for the specified provider
    switch (provider) {
      case "google":
        if (!user.googleId) {
          return sendErrorResponse({
            res,
            message: "Google account is not linked",
            errorCode: "NOT_LINKED",
            errorDetails: "No Google account is currently linked to your account",
            status: 400,
          });
        }
        currentStatus = user.preferences.isGoogleAuthEnabled;
        newStatus = !currentStatus;

        // Prevent disabling if this is the last authentication method
        if (currentStatus && !newStatus) {
          const hasPassword = !!user.password && user.authProvider === "local";
          const hasFacebookLinkedAndEnabled = !!user.facebookId && user.preferences.isFacebookAuthEnabled;

          if (!hasPassword && !hasFacebookLinkedAndEnabled) {
            return sendErrorResponse({
              res,
              message: "Cannot disable last authentication method",
              errorCode: "LAST_AUTH_METHOD",
              errorDetails:
                "You cannot disable Google authentication as it's your only way to log in. Please link another account or set up a password first.",
              status: 400,
            });
          }
        }

        user.preferences.isGoogleAuthEnabled = newStatus;
        break;

      case "facebook":
        if (!user.facebookId) {
          return sendErrorResponse({
            res,
            message: "Facebook account is not linked",
            errorCode: "NOT_LINKED",
            errorDetails: "No Facebook account is currently linked to your account",
            status: 400,
          });
        }
        currentStatus = user.preferences.isFacebookAuthEnabled;
        newStatus = !currentStatus;

        // Prevent disabling if this is the last authentication method
        if (currentStatus && !newStatus) {
          const hasPassword = !!user.password && user.authProvider === "local";
          const hasGoogleLinkedAndEnabled = !!user.googleId && user.preferences.isGoogleAuthEnabled;

          if (!hasPassword && !hasGoogleLinkedAndEnabled) {
            return sendErrorResponse({
              res,
              message: "Cannot disable last authentication method",
              errorCode: "LAST_AUTH_METHOD",
              errorDetails:
                "You cannot disable Facebook authentication as it's your only way to log in. Please link another account or set up a password first.",
              status: 400,
            });
          }
        }

        user.preferences.isFacebookAuthEnabled = newStatus;
        break;

      default:
        return sendErrorResponse({
          res,
          message: "Unsupported provider",
          errorCode: "UNSUPPORTED_PROVIDER",
          errorDetails: "This provider is not supported for login toggling",
          status: 400,
        });
    }

    await user.save();

    const action = newStatus ? "enabled" : "disabled";

    return sendSuccessResponse({
      res,
      message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} login ${action} successfully`,
      data: {
        linkedProviders: {
          google: !!user.googleId,
          facebook: !!user.facebookId,
          apple: !!user.appleId,
        },
        loginPermissions: {
          google: user.preferences.isGoogleAuthEnabled,
          facebook: user.preferences.isFacebookAuthEnabled,
        },
      },
      status: 200,
    });
  } catch (error) {
    return sendErrorResponse({
      res,
      message: "Failed to toggle social account login",
      errorCode: "TOGGLE_FAILED",
      errorDetails: `Error toggling social account login: ${error.message}`,
      status: 500,
    });
  }
};

/**
 * Get linked accounts status
 */
export const getLinkedAccounts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return sendErrorResponse({
        res,
        message: "User not authenticated",
        errorCode: "NOT_AUTHENTICATED",
        errorDetails: "Please log in to view linked accounts",
        status: 401,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse({
        res,
        message: "User not found",
        errorCode: "USER_NOT_FOUND",
        errorDetails: "User account not found",
        status: 404,
      });
    }

    return sendSuccessResponse({
      res,
      message: "Linked accounts retrieved successfully",
      data: {
        linkedProviders: {
          google: !!user.googleId,
          facebook: !!user.facebookId,
          apple: !!user.appleId,
        },
        loginPermissions: {
          google: user.preferences.isGoogleAuthEnabled,
          facebook: user.preferences.isFacebookAuthEnabled,
        },
        hasPassword: !!user.password && user.authProvider === "local",
        primaryAuthProvider: user.authProvider,
      },
      status: 200,
    });
  } catch (error) {
    return sendErrorResponse({
      res,
      message: "Failed to get linked accounts",
      errorCode: "GET_LINKED_FAILED",
      errorDetails: `Error getting linked accounts: ${error.message}`,
      status: 500,
    });
  }
};
