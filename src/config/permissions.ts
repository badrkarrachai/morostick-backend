/**
 * This file contains the permissions and roles used in the application.
 * Each permission represents a specific action that can be performed on a resource.
 * Each role represents a group of users with specific permissions.
 * The permissions are assigned to roles based on the user's role.
 */

export const PERMISSIONS = {};

export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  RESHIPPER: "reshipper",
};

const allPermissions = Object.values(PERMISSIONS);

const excludePermissions = (permissions, excludedPermissions) => {
  return permissions.filter(
    (permission) => !excludedPermissions.includes(permission)
  );
};

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: allPermissions,
  [ROLES.USER]: excludePermissions(allPermissions, []),
};
