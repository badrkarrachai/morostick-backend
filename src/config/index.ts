import dotenv from "dotenv";
import { existsSync } from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  console.log("Loading environment variables from .env file");
  dotenv.config();
} else {
  console.log("No .env file found, using existing environment variables");
}

export default {
  app: {
    port: parseInt(process.env.PORT, 10),
    baseUrl: process.env.BASE_URL,
    apiPrefix: process.env.API_PREFIX,
    appName: process.env.APP_NAME,
    issuer: process.env.ISSUER,
    version: process.env.APP_VERSION,
    audience: process.env.AUDIENCE,
    recoveryPeriod: parseInt(process.env.ACCOUNT_RECOVERY_PERIOD, 10),
    env: process.env.NODE_ENV,
  },
  logs: {
    morgan: process.env.MORGAN,
  },
  mongodb: {
    url: process.env.MONGODB_URL,
  },
  jwtSecret: {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: parseInt(process.env.ACCESS_TOKEN_EXPIRES_IN, 10),
    refreshTokenExpiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN, 10),
  },
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === "true",
    user: process.env.EMAIL_USER,
    appName: process.env.APP_NAME,
    pass: process.env.EMAIL_PASS,
  },
  otp: {
    expiration: parseInt(process.env.OTP_EXPIRATION, 10),
    length: parseInt(process.env.OTP_LENGTH, 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS, 10),
    allowedResendInterval: parseInt(
      process.env.OTP_ALLOWED_RESEND_INTERVAL,
      10
    ),
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10),
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS, 10),
  },
  google: {
    mobileClientID: process.env.GOOGLE_MOBILE_CLIENT_ID,
  },
  facebook: {
    appID: process.env.FACEBOOK_MOBILE_APP_ID,
    appSecret: process.env.FACEBOOK_MOBILE_APP_SECRET,
  },
  cloudflare: {
    r2: {
      tokenValue: process.env.CLOUDFLARE_R2_TOKEN_VALUE,
      accessKeyID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL,
    },
  },
};
