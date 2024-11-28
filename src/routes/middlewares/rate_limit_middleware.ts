import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import type { Options, RateLimitRequestHandler } from "express-rate-limit";
import { sendErrorResponse } from "../../utils/response_handler_util";

interface CustomRateLimitOptions extends Partial<Options> {
  windowMs?: number;
  max?: number;
  message?: string;
  statusCode?: number;
}

/**
 * Creates a rate limiter middleware with custom configuration
 * @param options - Rate limiting options
 * @returns Express middleware for rate limiting
 */
const createLimiter = (
  options: CustomRateLimitOptions
): RateLimitRequestHandler => {
  const defaultOptions: CustomRateLimitOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: "Too many requests from this IP, please try again later",
    statusCode: 429,
  };

  return rateLimit({
    ...defaultOptions,
    ...options,
    keyGenerator: (req: Request): string => {
      // If user is authenticated, use user ID as key
      if (req.user?.id) {
        return `user_${req.user.id}`;
      }
      // Otherwise use IP address
      return (
        req.ip ||
        (req.headers["x-forwarded-for"] as string) ||
        req.socket.remoteAddress ||
        "unknown"
      );
    },
    handler: (req: Request, res: Response): void => {
      sendErrorResponse({
        res,
        message: options.message || defaultOptions.message!,
        errorCode: "RATE_LIMIT_EXCEEDED",
        errorDetails: `Rate limit of ${
          options.max || defaultOptions.max
        } requests per ${
          (options.windowMs || defaultOptions.windowMs) / 1000
        } seconds exceeded`,
        status: options.statusCode || defaultOptions.statusCode!,
      });
    },
    skip: (req: Request): boolean => {
      // Skip rate limiting for admin users
      return req.user?.role === "admin";
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Predefined rate limiters
export const rateLimiters = {
  // Public routes - more lenient
  public: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  }),

  // Search endpoints
  search: createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: "Search rate limit exceeded, please try again later",
  }),

  // Stats updates
  stats: createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50,
    message: "Stats update rate limit exceeded, please try again later",
  }),

  // Upload endpoints - more strict
  upload: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: "Upload rate limit exceeded, please try again later",
  }),

  // Auth endpoints - very strict
  auth: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: "Too many authentication attempts, please try again later",
  }),

  // For high-traffic endpoints
  highTraffic: createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10,
    message: "Too many requests, please slow down",
  }),

  // Factory function for custom limiters
  create: createLimiter,
};
