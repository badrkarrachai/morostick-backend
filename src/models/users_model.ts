import { Schema, model, Types, Model, models } from "mongoose";
import { IUser } from "../interfaces/user_interface";
import { ROLES } from "../config/permissions";

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    emailVerified: { type: Boolean, default: false },
    password: { type: String, required: true },
    avatar: { type: Schema.Types.ObjectId, ref: "Image" },
    isActivated: { type: Boolean, default: true },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
    },
    lastLogin: { type: Date },
    twoFactorSecret: { type: String },
    twoFactorEnabled: { type: Boolean, default: false },
    resetPasswordOTP: { type: String },
    isOtpUsed: { type: Boolean, default: false },
    lastOTPSentAt: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    resetPasswordOTPExpires: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    reasonForDeletion: { type: [String], default: [] },
    awayDateStart: { type: Date },
    awayDateEnd: { type: Date },
    preferences: {
      currency: { type: String, default: "USD" },
      language: { type: String, default: "en" },
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      isGoogleAuthEnabled: { type: Boolean, default: false },
      isFacebookAuthEnabled: { type: Boolean, default: false },
    },
    socialMedia: {
      facebook: { type: String },
      x: { type: String },
      linkedin: { type: String },
      instagram: { type: String },
    },
    notificationSettings: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    // OAuth fields
    googleId: { type: String, unique: true, sparse: true },
    facebookId: { type: String, unique: true, sparse: true }, // Added Facebook ID
    appleId: { type: String, unique: true, sparse: true },
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook", "discord", "apple"], // Added facebook to enum
      default: "local",
    },
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiresAt: { type: Date },
    // Sticker and Packs
    stickers: [{ type: Types.ObjectId, ref: "Sticker" }],
    packs: [{ type: Types.ObjectId, ref: "Pack" }],
    favoritesPacks: [{ type: Types.ObjectId, ref: "Pack" }],
    favoritesStickers: [{ type: Types.ObjectId, ref: "Sticker" }],
    hiddenPacks: [{ type: Types.ObjectId, ref: "Pack" }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ facebookId: 1 }, { sparse: true });
userSchema.index({ appleId: 1 }, { sparse: true });

// Changed model creation to prevent compilation errors
const User: Model<IUser> = models.User || model<IUser>("User", userSchema);
export default User;
