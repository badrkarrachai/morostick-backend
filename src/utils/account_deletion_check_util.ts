import { Response } from "express";

export function checkAccountRecoveryStatus(
  user: any,
  recoveryPeriod: number,
  res: Response
): string | null {
  if (user.isDeleted && user.deletedAt) {
    // Current date
    const now = new Date();

    // Recovery period end date (recoveryPeriod days after `deletedAt`)
    const recoveryEndDate = new Date(
      user.deletedAt.getTime() + recoveryPeriod * 24 * 60 * 60 * 1000
    );

    // Calculate the number of days left in the recovery period
    const daysLeftInRecoveryPeriod = Math.ceil(
      (recoveryEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeftInRecoveryPeriod > 0) {
      // Return the message string if within the recovery period
      return `Your account is in the deletion process, You have ${daysLeftInRecoveryPeriod} day${
        daysLeftInRecoveryPeriod !== 1 ? "s" : ""
      } left to reactivate it.`;
    } else {
      return "deleted";
    }
  }

  return null; // No action needed if account is not deleted or deletedAt is not set
}
