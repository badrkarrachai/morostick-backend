import { Document, Types } from "mongoose";
import { IImages } from "./image_interface";

export interface IUser extends Document {
  name: string;
  email: string;
  emailVerified: boolean;
  password: string;
  avatar?: Types.ObjectId | IImages;
  isActivated: boolean;
  role: string;
  lastLogin?: Date;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  resetPasswordOTP: String;
  isOtpUsed: boolean;
  lastOTPSentAt: Date;
  otpAttempts: number;
  resetPasswordOTPExpires: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  reasonForDeletion?: string[];
  awayDateStart?: Date;
  awayDateEnd?: Date;
  preferences: {
    currency: string;
    language: string;
    theme: string;
  };
  socialMedia?: {
    facebook?: string;
    x?: string;
    linkedin?: string;
    instagram?: string;
  };
  notificationSettings: {
    email: boolean;
    push: boolean;
  };
  googleId?: string;
  facebookId?: string;
  appleId: string;
  authProvider: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
