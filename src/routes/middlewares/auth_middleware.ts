import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, verifyRefreshToken, generateAccessToken } from "../../utils/jwt_util";
import { sendErrorResponse } from "../../utils/response_handler_util";
import User from "../../models/users_model";
import { RateLimiterMemory } from "rate-limiter-flexible";
import config from "../../config";

// More lenient rate limiter for private endpoints
const rateLimiter = new RateLimiterMemory({
  points: 30, // Number of attempts
  duration: 60, // Per minute
  blockDuration: 60, // Block for 1 minute if exceeded
});

// Custom error class for auth errors
class AuthError extends Error {
  constructor(public message: string, public errorCode: string, public errorDetails: string, public status: number) {
    super(message);
    this.name = "AuthError";
  }
}

interface AuthRequest extends Request {
  user?: any;
}

// Handle different types of auth errors
const handleAuthError = (error: any): AuthError => {
  switch (error.name) {
    case "TokenExpiredError":
      return new AuthError(
        "Session timed out",
        "SESSION_TIMEOUT",
        "Your session has timed out for security reasons. Please log in again to continue.",
        401
      );
    case "JsonWebTokenError":
      return new AuthError("Authentication failed", "AUTH_FAILED", "We couldn't verify your identity. Please try logging in again.", 401);
    default:
      return new AuthError("Oops! Something went wrong", "UNEXPECTED_ERROR", "We encountered an unexpected error. Please try again later.", 500);
  }
};

// Extract and validate bearer token
export const extractToken = (authHeader: string | undefined): string => {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Invalid authentication format", "INVALID_AUTH_FORMAT", "Please provide a valid authentication token.", 401);
  }
  return authHeader.split(" ")[1];
};

// Main authentication middleware
export const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Rate limiting
    await rateLimiter.consume(req.ip);

    // Extract and validate token
    const token = extractToken(req.header("Authorization"));

    // Verify access token
    const decoded = await verifyAccessToken(token);
    req.user = decoded.user;

    // Validate user exists and is active
    const user = await User.findById(req.user.id).select("+isActivated");

    if (!user || !user.isActivated) {
      throw new AuthError("Account not found or inactive", "ACCOUNT_NOT_FOUND", "We couldn't find an active account with these credentials.", 404);
    }

    // Check if token needs renewal based on iat
    const now = Math.floor(Date.now() / 1000);
    const tokenAge = now - (decoded.iat || now);
    const renewalThreshold = config.jwtSecret.accessTokenExpiresIn * 60 - 5 * 60;

    if (tokenAge > renewalThreshold) {
      const newAccessToken = generateAccessToken(user._id.toString(), user.role, user.name, user.email, user.emailVerified);
      res.setHeader("X-New-Access-Token", newAccessToken);
    }

    next();
  } catch (error) {
    if (error.name === "AuthError") {
      return sendErrorResponse({
        res,
        message: error.message,
        errorCode: error.errorCode,
        errorDetails: error.errorDetails,
        status: error.status,
      });
    }

    // Handle rate limiter errors
    if (error.name === "RateLimiterError") {
      return sendErrorResponse({
        res,
        message: "Too many requests",
        errorCode: "RATE_LIMIT_EXCEEDED",
        errorDetails: "Please wait a moment before trying again.",
        status: 429,
      });
    }

    const authError = handleAuthError(error);
    return sendErrorResponse({
      res,
      message: authError.message,
      errorCode: authError.errorCode,
      errorDetails: authError.errorDetails,
      status: authError.status,
    });
  }
};

// Optional: Role-based access control middleware
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendErrorResponse({
        res,
        message: "Access denied",
        errorCode: "INSUFFICIENT_PERMISSIONS",
        errorDetails: "You don't have permission to access this resource.",
        status: 403,
      });
    }
    next();
  };
};
