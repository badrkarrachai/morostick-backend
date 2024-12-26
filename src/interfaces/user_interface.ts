import { Document, Types } from "mongoose";
import { IImages } from "./image_interface";

export interface IUser extends Document {
  // Basic User Information
  name: string;
  email: string;
  emailVerified: boolean;
  password: string;
  avatar?: Types.ObjectId | IImages;
  isActivated: boolean;
  role: string;
  lastLogin?: Date;

  // Two-Factor Authentication
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;

  // Password Reset and OTP Management
  resetPasswordOTP: String;
  isOtpUsed: boolean;
  lastOTPSentAt: Date;
  otpAttempts: number;
  resetPasswordOTPExpires: Date;

  // Account Status and Deletion
  isDeleted: boolean;
  deletedAt?: Date;
  reasonForDeletion?: string[];

  // Availability Status
  awayDateStart?: Date;
  awayDateEnd?: Date;

  // User Preferences
  preferences: {
    currency: string;
    language: string;
    theme: string;
  };

  // Social Media Links
  socialMedia?: {
    facebook?: string;
    x?: string;
    linkedin?: string;
    instagram?: string;
  };

  // Notification Preferences
  notificationSettings: {
    email: boolean;
    push: boolean;
  };

  // OAuth and Authentication
  googleId?: string;
  facebookId?: string;
  appleId: string;
  authProvider: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;

  // User Stickers and Packs
  stickers: Types.ObjectId[];
  packs: Types.ObjectId[];
  favoritesPacks: Types.ObjectId[];
  favoritesStickers: Types.ObjectId[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
