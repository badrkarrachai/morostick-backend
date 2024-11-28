// types/storage.types.ts

export type AllowedFileFormat = "webp" | "png" | "gif";

export interface UploadResult {
  success: boolean;
  url: string;
  webpUrl: string;
  width: number;
  height: number;
  isAnimated: boolean;
  format: AllowedFileFormat;
  originalFormat: string;
  fileSize: number;
}

// Helper function to check if a string is a valid file format
export const isValidFileFormat = (
  format: string
): format is AllowedFileFormat => {
  return ["webp", "png", "gif"].includes(format);
};

// Helper function to convert mime type to file format
export const mimeTypeToFormat = (mimeType: string): AllowedFileFormat => {
  switch (mimeType.toLowerCase()) {
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    default:
      return "webp"; // Default to webp as we convert everything to webp anyway
  }
};
