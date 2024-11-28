import jwt from "jsonwebtoken";
import config from "../config";
import { JwtPayload } from "../interfaces/jwt_payload_interface";
import { IUser } from "../interfaces/user_interface";
import { Response } from "express";
import crypto from "crypto";

const accessTokenSecret = config.jwtSecret.accessTokenSecret;
const refreshTokenSecret = config.jwtSecret.refreshTokenSecret;

// Function to generate a unique JWT ID
const generateUniqueId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

// Generate Access Token
export const generateAccessToken = (
  userId: string,
  userRole: string,
  name: string,
  email: string,
  isVerified: boolean
): string => {
  const payload: JwtPayload = {
    user: {
      id: userId,
      role: userRole,
      name: name,
      email: email,
      isVerified: isVerified,
    },
    iss: config.app.issuer,
    sub: userId,
    aud: config.app.audience,
    iat: Math.floor(Date.now() / 1000),
    nbf: Math.floor(Date.now() / 1000),
    jti: generateUniqueId(),
  };

  return jwt.sign(payload, accessTokenSecret, {
    expiresIn: `${config.jwtSecret.accessTokenExpiresIn}m`,
    algorithm: "HS256",
  });
};

// Generate Refresh Token
export const generateRefreshToken = (
  userId: string,
  userRole: string,
  name: string,
  email: string,
  isVerified: boolean
): string => {
  const payload: JwtPayload = {
    user: {
      id: userId,
      role: userRole,
      name: name,
      email: email,
      isVerified: isVerified,
    },
    iss: config.app.issuer,
    sub: userId,
    aud: config.app.audience,
    iat: Math.floor(Date.now() / 1000),
    nbf: Math.floor(Date.now() / 1000),
    jti: generateUniqueId(),
  };

  return jwt.sign(payload, refreshTokenSecret, {
    expiresIn: `${config.jwtSecret.refreshTokenExpiresIn}d`,
    algorithm: "HS256",
  });
};

// Verify Access Token
export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, accessTokenSecret, {
    audience: config.app.audience,
    issuer: config.app.issuer,
    algorithms: ["HS256"],
  }) as JwtPayload;
};

// Verify Refresh Token
export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, refreshTokenSecret, {
    audience: config.app.audience,
    issuer: config.app.issuer,
    algorithms: ["HS256"],
  }) as JwtPayload;
};

// Prepare JWT for auth responses
export const prepareJWTTokensForAuth = (user: IUser, res: Response): string => {
  const accessToken = generateAccessToken(
    user.id,
    user.role,
    user.name,
    user.email,
    user.emailVerified
  );
  const refreshToken = generateRefreshToken(
    user.id,
    user.role,
    user.name,
    user.email,
    user.emailVerified
  );

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: config.app.env === "production",
    sameSite: "strict",
    maxAge: config.jwtSecret.refreshTokenExpiresIn * 24 * 60 * 60 * 1000,
  });
  return accessToken;
};
