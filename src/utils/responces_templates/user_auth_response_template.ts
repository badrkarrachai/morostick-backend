import { IImages } from "../../interfaces/image_interface";
import { IUser } from "../../interfaces/user_interface";
import { formatImageData } from "./image_response_template";

/**
 * Utility function to format user data for responses.
 *
 * @param user - The user object from the database.
 * @param messagesForUser - Optional messages to include in the response.
 * @returns The formatted user data object.
 */
export async function formatUserData(user: IUser, messagesForUser: string[] = []): Promise<Record<string, any>> {
  await user.populate("avatar");
  await user.populate("coverImage");
  const userCoverImage = user.coverImage ? formatImageData(user.coverImage) : null;
  const userAvatar = user.avatar ? formatImageData(user.avatar) : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    passwordLastChanged: user.passwordLastChanged,
    role: user.role,
    avatar: userAvatar,
    coverImage: userCoverImage,
    isActivated: user.isActivated,
    preferences: user.preferences,
    notificationSettings: user.notificationSettings,
    awayDateStart: user.awayDateStart,
    awayDateEnd: user.awayDateEnd,
    socialMedia: user.socialMedia,
    isDeleted: user.isDeleted,
    deletedAt: user.deletedAt,
    twoFactorEnabled: user.twoFactorEnabled,
    authProvider: user.authProvider,
    messages: messagesForUser,
  };
}
