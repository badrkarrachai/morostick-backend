import { IUser } from "./user_interface";

export interface OTPOptions {
  length: number;
  expiration: number;
  user: IUser;
  subject: string;
  template?: string;
  maxAttempts?: number;
  allowedResendInterval?: number; // minutes
}
