import { Response } from "express";
import config from "../config";

export interface ApiResponse<T> {
  status: number;
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    errorFields?: string[];
    details: string;
  };
  metadata?: {
    timestamp: string;
    version: string;
  };
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface SuccessResponseOptions<T> {
  res: Response;
  message: string;
  data?: T;
  status?: number;
  pagination?: PaginationInfo;
}

export interface ErrorResponseOptions {
  res: Response;
  message: string;
  errorCode: string;
  errorFields?: string[];
  errorDetails: string;
  status?: number;
}

export const sendResponse = <T>(
  res: Response,
  status: number,
  success: boolean,
  message: string,
  data?: T,
  error?: { code: string; errorFields?: string[]; details: string },
  pagination?: PaginationInfo
) => {
  const response: ApiResponse<T> = {
    status,
    success,
    message,
    data,
    error,
    metadata: {
      timestamp: new Date().toISOString(),
      version: config.app.version,
    },
    pagination,
  };
  return res.status(status).json(response);
};

export const sendSuccessResponse = <T>({
  res,
  message,
  data,
  status = 200,
  pagination,
}: SuccessResponseOptions<T>) => {
  return sendResponse(res, status, true, message, data, undefined, pagination);
};

export const sendErrorResponse = ({
  res,
  message,
  errorCode,
  errorFields,
  errorDetails,
  status = 400,
}: ErrorResponseOptions) => {
  return sendResponse(res, status, false, message, undefined, {
    errorFields: errorFields,
    code: errorCode,
    details: errorDetails,
  });
};
