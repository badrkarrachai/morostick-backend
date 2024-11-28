import rateLimit from "express-rate-limit";
import config from "../config";

// Rate limiter to prevent brute force attacks
export const rateLimiterGeneral = rateLimit({
  windowMs: config.rateLimit.windowMs, //Time
  max: config.rateLimit.max, // limit each IP to 5 login requests per windowMs
  message: {
    status: 429,
    success: false,
    message: "Too many requests",
    error: {
      code: "TOO_MANY_REQUESTS",
      details: "Too many requests from this IP, please try again later.",
    },
    metadata: {
      timestamp: new Date().toISOString(),
      version: config.app.version,
    },
  },
  keyGenerator: (req) => req.ip,
});
