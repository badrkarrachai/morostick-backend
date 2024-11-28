import { Request, Response } from "express";
import { sendEmail } from "./email_sender_util";
import { readHtmlTemplate } from "./read_html_util";
import config from "../config";
import bcrypt from "bcrypt";
import { IUser } from "../interfaces/user_interface";
import { OTPOptions } from "../interfaces/otp_options";

interface OTPValidationResult {
  isValid: boolean;
  message: string;
  status:
    | "VALID"
    | "EXPIRED"
    | "INVALID"
    | "USED"
    | "MAX_ATTEMPTS"
    | "TOO_MANY_REQUESTS";
  remainingAttempts?: number;
  details: string;
  nextResendTime?: Date;
}

class OTPService {
  private static async generateOTP(
    length: number
  ): Promise<{ hashedOtp: string; plainOtp: string }> {
    try {
      const min = Math.pow(10, length - 1);
      const max = Math.pow(10, length) - 1;
      const plainOtp = Math.floor(min + Math.random() * (max - min + 1))
        .toString()
        .padStart(length, "0");
      const hashedOtp = await bcrypt.hash(plainOtp, config.bcrypt.rounds);
      return { hashedOtp, plainOtp };
    } catch (error) {
      console.log("Error generating OTP:", error);
      throw new Error("Failed to generate OTP");
    }
  }

  private static isOTPExpired(expiryDate: Date): boolean {
    return expiryDate.getTime() < Date.now();
  }

  private static canResendOTP(
    user: IUser,
    allowedResendInterval: number
  ): { canResend: boolean; nextResendTime?: Date; remainingTime?: string } {
    if (!user.lastOTPSentAt) return { canResend: true };

    const waitTime = allowedResendInterval * 1000;
    const timeElapsed = Date.now() - user.lastOTPSentAt.getTime();
    const remainingMs = waitTime - timeElapsed;

    if (remainingMs > 0) {
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const remainingTime = `${remainingSeconds}`;
      const nextResendTime = new Date(user.lastOTPSentAt.getTime() + waitTime);
      return { canResend: false, nextResendTime, remainingTime };
    }

    return { canResend: true };
  }

  static async sendOTP(options: OTPOptions): Promise<{
    success: boolean;
    message: string;
    details: string;
    nextResendTime?: Date;
  }> {
    const {
      length,
      expiration,
      user,
      subject,
      template,
      allowedResendInterval,
    } = options;

    try {
      if (!user?.email) {
        throw new Error("Valid user with email is required");
      }

      const resendCheck = this.canResendOTP(user, allowedResendInterval);
      if (!resendCheck.canResend) {
        return {
          success: false,
          message: `Please wait ${resendCheck.remainingTime} second(s)`,
          details: `Please wait ${resendCheck.remainingTime} second(s) before requesting another Code.`,
          nextResendTime: resendCheck.nextResendTime,
        };
      }

      const { hashedOtp, plainOtp } = await this.generateOTP(length);

      // Update user with OTP info
      user.resetPasswordOTP = hashedOtp;
      user.resetPasswordOTPExpires = new Date(
        Date.now() + expiration * 60 * 1000
      );
      user.isOtpUsed = false;
      user.otpAttempts = 0;
      user.lastOTPSentAt = new Date(); // Track when OTP was sent
      await user.save();

      // Prepare and send email
      let htmlContent = readHtmlTemplate(template);
      htmlContent = htmlContent
        .replace(/{{OTP}}/g, plainOtp)
        .replace(/{{EXP-OTP}}/g, expiration.toString())
        .replace(/{{USERNAME}}/g, user.name || "User");

      sendEmail({
        to: user.email,
        subject,
        html: htmlContent,
        text: `Your OTP is: ${plainOtp}. It will expire in ${expiration} minutes.`,
      });

      console.log(`OTP sent successfully to user: ${user._id}`);
      return {
        success: true,
        message: "OTP sent successfully",
        details: "Your OTP has been sent successfully.",
      };
    } catch (error) {
      console.log("Error sending OTP:", error);
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }

  static async verifyOTPLocally(
    user: IUser,
    otp: string,
    maxAttempts: number,
    deleteAfterVerify: boolean = false
  ): Promise<OTPValidationResult> {
    try {
      if (!user || !user.resetPasswordOTP) {
        return {
          isValid: false,
          message: "Invalid user or OTP not requested",
          details: "Sorry but you have not requested an OTP yet.",
          status: "INVALID",
        };
      }

      if (user.isOtpUsed) {
        return {
          isValid: false,
          message: "OTP has already been used",
          details:
            "Oops.! this code has already been used, try requesting a new one.",
          status: "USED",
        };
      }

      if (user.otpAttempts >= maxAttempts) {
        return {
          isValid: false,
          message: "Maximum attempts exceeded",
          details:
            "Sorry you have reached maximum attempts, try requesting a new one.",
          status: "MAX_ATTEMPTS",
          remainingAttempts: 0,
        };
      }

      if (this.isOTPExpired(user.resetPasswordOTPExpires)) {
        return {
          isValid: false,
          message: "OTP has expired",
          details: "Oops.! this code has expired, try requesting a new one.",
          status: "EXPIRED",
        };
      }

      const isMatch = await bcrypt.compare(
        otp,
        user.resetPasswordOTP.toString()
      );

      if (!isMatch) {
        user.otpAttempts = (user.otpAttempts || 0) + 1;
        await user.save();

        return {
          isValid: false,
          message: "Invalid OTP",
          details: "Sorry but the provided code is invalid.",
          status: "INVALID",
          remainingAttempts: maxAttempts - user.otpAttempts,
        };
      }

      if (deleteAfterVerify) {
        // Success - Clear OTP data
        user.isOtpUsed = true;
        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpires = undefined;
        await user.save();
      } else {
        // Success - Clear OTP data
        user.otpAttempts = 0;
        await user.save();
      }

      console.log(`OTP verified successfully for user: ${user._id}`);
      return {
        isValid: true,
        message: "OTP verified successfully",
        details: "Your OTP has been verified successfully.",
        status: "VALID",
      };
    } catch (error) {
      console.log("Error verifying OTP:", error);
      throw new Error(`OTP verification failed: ${error.message}`);
    }
  }
}

export default OTPService;
