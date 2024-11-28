import { Response, Request, NextFunction } from "express";
import { sendErrorResponse } from "../../utils/response_handler_util";
import { hasPermission } from "../../utils/permission_util";

export const checkPermission = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendErrorResponse({
        res,
        message: "Unauthorized",
        errorCode: "UNAUTHORIZED",
        errorDetails: "User authentication is required for this action.",
        status: 401,
      });
    }

    if (!hasPermission(req.user.role, requiredPermission)) {
      return sendErrorResponse({
        res,
        message: "Forbidden",
        errorCode: "FORBIDDEN",
        errorDetails:
          "You do not have the required permissions for this action.",
        status: 403,
      });
    }

    next();
  };
};
