// utils/storage_util.ts

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import os from "os";
import { AllowedFileFormat, mimeTypeToFormat } from "../types/storage.types";
import config from "../config";
import { AVATAR_REQUIREMENTS, COVER_REQUIREMENTS, PLATFORM_CONFIGS } from "../config/app_requirement";

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: config.cloudflare.r2.endpoint,
  credentials: {
    accessKeyId: config.cloudflare.r2.accessKeyID,
    secretAccessKey: config.cloudflare.r2.secretAccessKey,
  },
});

const BUCKET_NAME = config.cloudflare.r2.bucketName;

interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  isAnimated: boolean;
}

interface UploadResult {
  success: boolean;
  url: string;
  width: number;
  height: number;
  isAnimated: boolean;
  format: string;
  originalFormat: string;
  fileSize: number;
}

async function processStaticImage(
  buffer: Buffer,
  platform: "whatsapp" // Add more platforms as needed
): Promise<ProcessedImage> {
  const config = PLATFORM_CONFIGS[platform].static;

  const processed = await sharp(buffer)
    .resize(config.width, config.height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: config.quality })
    .toBuffer();

  // Check if size exceeds platform limit
  if (processed.length > config.maxSize) {
    // Try again with lower quality
    const reducedQualityBuffer = await sharp(buffer)
      .resize(config.width, config.height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 60 }) // Lower quality for size reduction
      .toBuffer();

    const metadata = await sharp(reducedQualityBuffer).metadata();

    return {
      buffer: reducedQualityBuffer,
      width: metadata.width || config.width,
      height: metadata.height || config.height,
      format: "webp",
      isAnimated: false,
    };
  }

  const metadata = await sharp(processed).metadata();

  return {
    buffer: processed,
    width: metadata.width || config.width,
    height: metadata.height || config.height,
    format: "webp",
    isAnimated: false,
  };
}

// Alternative implementation with progressive quality reduction
async function processStaticImageProgressive(buffer: Buffer, platform: "whatsapp"): Promise<ProcessedImage> {
  const config = PLATFORM_CONFIGS[platform].static;
  let quality = config.quality;
  let processed: Buffer;

  // Try progressively lower qualities until we meet size requirements
  // or hit minimum quality threshold
  while (quality >= 40) {
    processed = await sharp(buffer)
      .resize(config.width, config.height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality })
      .toBuffer();

    if (processed.length <= config.maxSize) {
      const metadata = await sharp(processed).metadata();
      return {
        buffer: processed,
        width: metadata.width || config.width,
        height: metadata.height || config.height,
        format: "webp",
        isAnimated: false,
      };
    }

    quality -= 10; // Reduce quality and try again
  }

  // If we still can't meet size requirements, throw an error
  throw new Error("Unable to process image to meet size requirements");
}

// Add a utility function for size optimization
async function optimizeWebP(buffer: Buffer, maxSize: number, initialQuality: number = 85): Promise<ProcessedImage> {
  let quality = initialQuality;
  const minQuality = 40;
  const qualityStep = 5;

  while (quality >= minQuality) {
    try {
      const processed = await sharp(buffer).webp({ quality }).toBuffer();

      if (processed.length <= maxSize) {
        const metadata = await sharp(processed).metadata();
        return {
          buffer: processed,
          width: metadata.width || 0,
          height: metadata.height || 0,
          format: "webp",
          isAnimated: false,
        };
      }
    } catch (error) {
      console.error(`Error processing at quality ${quality}:`, error);
    }

    quality -= qualityStep;
  }

  // If we get here, we couldn't meet the size requirement
  throw new Error(`Could not optimize image to below ${maxSize} bytes`);
}

export const uploadToStorage = async (file: Express.Multer.File, folder: string): Promise<UploadResult> => {
  try {
    const metadata = await sharp(file.buffer).metadata();
    const isAnimated = file.mimetype.includes("gif") || metadata.pages !== undefined;
    let processedImage: ProcessedImage;

    try {
      if (isAnimated) {
        processedImage = await processAnimatedSticker(file.buffer, "whatsapp");
      } else {
        processedImage = await processStaticImageProgressive(file.buffer, "whatsapp");
      }
    } catch (error) {
      if (error.message.includes("size requirements")) {
        const maxSize = isAnimated ? PLATFORM_CONFIGS.whatsapp.animated.maxSize : PLATFORM_CONFIGS.whatsapp.static.maxSize;
        processedImage = await optimizeWebP(file.buffer, maxSize);
      } else {
        throw error;
      }
    }

    // Generate unique filename (simplified)
    const filename = `${folder}/${uuidv4()}.${processedImage.format}`;

    // Single upload for processed file only
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: filename,
        Body: processedImage.buffer,
        ContentType: `image/${processedImage.format}`,
        ACL: "public-read",
      },
    });

    const result = await upload.done();

    return {
      success: true,
      url: `${config.cloudflare.r2.publicUrl}/${result.Key}`,
      width: processedImage.width,
      height: processedImage.height,
      isAnimated: processedImage.isAnimated,
      format: processedImage.format as AllowedFileFormat,
      originalFormat: mimeTypeToFormat(file.mimetype),
      fileSize: processedImage.buffer.length,
    };
  } catch (error) {
    console.error("Storage upload error:", error);
    throw new Error(`Failed to upload file to storage: ${error.message}`);
  }
};

// Modify processAnimatedSticker to better handle animated stickers
async function processAnimatedSticker(buffer: Buffer, platform: "whatsapp"): Promise<ProcessedImage> {
  const config = PLATFORM_CONFIGS[platform].animated;
  const tempDir = await fs.mkdtemp(`${os.tmpdir()}/sticker-`);
  const inputPath = `${tempDir}/input.gif`;
  const outputPath = `${tempDir}/output.webp`;

  try {
    // Save buffer to temporary file
    await fs.writeFile(inputPath, buffer);

    // Process with ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .size(`${config.width}x${config.height}`)
        .fps(config.fps)
        .duration(config.maxDuration)
        .outputFormat("webp")
        .videoFilter([
          "scale=iw*min(512/iw\\,512/ih):ih*min(512/iw\\,512/ih)",
          "pad=512:512:(512-iw*min(512/iw\\,512/ih))/2:(512-ih*min(512/iw\\,512/ih))/2:black@0",
        ])
        .output(outputPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    // Read processed file
    const processed = await fs.readFile(outputPath);

    // Verify size
    if (processed.length > config.maxSize) {
      // If size is still too large, try additional optimization
      const optimized = await optimizeWebP(processed, config.maxSize, 70);
      return {
        ...optimized,
        isAnimated: true,
      };
    }

    return {
      buffer: processed,
      width: config.width,
      height: config.height,
      format: "webp",
      isAnimated: true,
    };
  } catch (error) {
    console.error("Animation processing error:", error);
    throw new Error(`Failed to process animated sticker: ${error.message}`);
  } finally {
    // Clean up temp files
    await fs.rm(tempDir, { recursive: true }).catch(console.error);
  }
}

// Add a function to process static images with proper error handling
async function processStaticImageWithFallback(buffer: Buffer, platform: "whatsapp"): Promise<ProcessedImage> {
  try {
    // Try progressive processing first
    return await processStaticImageProgressive(buffer, platform);
  } catch (error) {
    // If progressive processing fails, try standard processing
    const result = await processStaticImage(buffer, platform);

    // If standard processing produces a file that's too large, try optimization
    if (result.buffer.length > PLATFORM_CONFIGS[platform].static.maxSize) {
      return await optimizeWebP(buffer, PLATFORM_CONFIGS[platform].static.maxSize, 60);
    }

    return result;
  }
}

export const deleteFromStorage = async (fileUrl: string): Promise<boolean> => {
  if (!fileUrl) return true; // Skip if no URL provided

  try {
    // Extract key from URL
    const key = fileUrl.replace(`${config.cloudflare.r2.publicUrl}/`, "");

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return true;
  } catch (error) {
    console.error("Storage delete error:", error);
    return false;
  }
};

interface ProcessedAvatar {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

async function processAvatar(buffer: Buffer): Promise<ProcessedAvatar> {
  try {
    // First, resize to a square with padding or cropping
    const squareImage = await sharp(buffer)
      .resize(AVATAR_REQUIREMENTS.maxWidth, AVATAR_REQUIREMENTS.maxWidth, {
        fit: "cover", // This will crop to maintain aspect ratio
        position: "center", // Center the crop
      })
      .toBuffer();

    // Then process the square image with compression
    const processed = await sharp(squareImage)
      .webp({
        quality: 85,
        effort: 6,
      })
      .toBuffer();

    // If size still exceeds max, try with lower quality
    if (processed.length > AVATAR_REQUIREMENTS.maxSize) {
      const reducedQuality = await sharp(squareImage)
        .webp({
          quality: 70,
          effort: 6,
        })
        .toBuffer();

      if (reducedQuality.length > AVATAR_REQUIREMENTS.maxSize) {
        throw new Error("Image too large even after compression");
      }

      const metadata = await sharp(reducedQuality).metadata();

      return {
        buffer: reducedQuality,
        width: metadata.width || AVATAR_REQUIREMENTS.maxWidth,
        height: metadata.width || AVATAR_REQUIREMENTS.maxWidth, // Use width for height to ensure square
        format: AVATAR_REQUIREMENTS.format,
        fileSize: reducedQuality.length,
      };
    }

    const metadata = await sharp(processed).metadata();

    return {
      buffer: processed,
      width: metadata.width || AVATAR_REQUIREMENTS.maxWidth,
      height: metadata.width || AVATAR_REQUIREMENTS.maxWidth, // Use width for height to ensure square
      format: AVATAR_REQUIREMENTS.format,
      fileSize: processed.length,
    };
  } catch (error) {
    console.error("Avatar processing error:", error);
    throw new Error(`Failed to process avatar: ${error.message}`);
  }
}

interface AvatarUploadResult {
  success: boolean;
  url: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

export const uploadAvatar = async (file: Express.Multer.File, userId: string): Promise<AvatarUploadResult> => {
  try {
    // Validate file type
    if (!file.mimetype.startsWith("image/")) {
      throw new Error("Invalid file type. Only images are allowed.");
    }

    // Process the avatar
    const processedAvatar = await processAvatar(file.buffer);

    // Generate unique filename
    const filename = `avatars/${userId}/${uuidv4()}.${processedAvatar.format}`;

    // Upload to R2
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: filename,
        Body: processedAvatar.buffer,
        ContentType: `image/${processedAvatar.format}`,
        ACL: "public-read",
        Metadata: {
          "original-filename": file.originalname,
          "user-id": userId,
        },
      },
    });

    const result = await upload.done();

    return {
      success: true,
      url: `${config.cloudflare.r2.publicUrl}/${result.Key}`,
      width: processedAvatar.width,
      height: processedAvatar.height,
      format: processedAvatar.format,
      fileSize: processedAvatar.fileSize,
    };
  } catch (error) {
    console.error("Avatar upload error:", error);
    throw new Error(`Failed to upload avatar: ${error.message}`);
  }
};

// Optional: Add a function to delete old avatars when updating
export const deleteOldAvatar = async (userId: string, oldAvatarUrl: string): Promise<boolean> => {
  if (!oldAvatarUrl) return true;

  try {
    // Extract key from URL
    const key = oldAvatarUrl.replace(`${config.cloudflare.r2.publicUrl}/`, "");

    // Only delete if it's in the user's avatar directory
    if (!key.startsWith(`avatars/${userId}/`)) {
      console.warn("Attempted to delete avatar from incorrect directory");
      return false;
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return true;
  } catch (error) {
    console.error("Avatar deletion error:", error);
    return false;
  }
};

export const uploadCoverImage = async (file: Express.Multer.File, userId: string): Promise<CoverImageUploadResult> => {
  try {
    // Validate file type
    if (!file.mimetype.startsWith("image/")) {
      throw new Error("Invalid file type. Only images are allowed.");
    }

    // Process the cover image
    const processedCover = await processCoverImage(file.buffer);

    // Generate unique filename
    const filename = `covers/${userId}/${uuidv4()}.${processedCover.format}`;

    // Upload to R2
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: filename,
        Body: processedCover.buffer,
        ContentType: `image/${processedCover.format}`,
        ACL: "public-read",
        Metadata: {
          "original-filename": file.originalname,
          "user-id": userId,
        },
      },
    });

    const result = await upload.done();

    return {
      success: true,
      url: `${config.cloudflare.r2.publicUrl}/${result.Key}`,
      width: processedCover.width,
      height: processedCover.height,
      format: processedCover.format,
      fileSize: processedCover.fileSize,
    };
  } catch (error) {
    console.error("Cover image upload error:", error);
    throw new Error(`Failed to upload cover image: ${error.message}`);
  }
};

interface CoverImageUploadResult {
  success: boolean;
  url: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

// Function to delete old cover images when updating
export const deleteOldCoverImage = async (userId: string, oldCoverImageUrl: string): Promise<boolean> => {
  if (!oldCoverImageUrl) return true;

  try {
    // Extract key from URL
    const key = oldCoverImageUrl.replace(`${config.cloudflare.r2.publicUrl}/`, "");

    // Ensure the key is within the correct directory
    if (!key.startsWith(`covers/${userId}/`)) {
      console.warn("Attempted to delete cover image from incorrect directory:", key);
      return false;
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return true;
  } catch (error) {
    console.error("Cover image deletion error:", error);
    return false;
  }
};

// Function to process cover image (resize, optimize, etc.)
export async function processCoverImage(buffer: Buffer): Promise<ProcessedCoverImage> {
  try {
    // First, resize to standard dimensions
    const resizedImage = await sharp(buffer)
      .resize(COVER_REQUIREMENTS.maxWidth, COVER_REQUIREMENTS.maxHeight, {
        fit: "cover", // Crop to maintain aspect ratio
        position: "center", // Center the crop
      })
      .toBuffer();

    // Then process the resized image with compression
    const processed = await sharp(resizedImage)
      .jpeg({
        quality: 85,
        force: true,
      })
      .toBuffer();

    // If size still exceeds max, try with lower quality
    if (processed.length > COVER_REQUIREMENTS.maxSize) {
      const reducedQuality = await sharp(resizedImage)
        .jpeg({
          quality: 70,
          force: true,
        })
        .toBuffer();

      if (reducedQuality.length > COVER_REQUIREMENTS.maxSize) {
        throw new Error("Cover image too large even after compression");
      }

      const metadata = await sharp(reducedQuality).metadata();

      return {
        buffer: reducedQuality,
        width: metadata.width || COVER_REQUIREMENTS.maxWidth,
        height: metadata.height || COVER_REQUIREMENTS.maxHeight,
        format: COVER_REQUIREMENTS.format,
        fileSize: reducedQuality.length,
      };
    }

    const metadata = await sharp(processed).metadata();

    return {
      buffer: processed,
      width: metadata.width || COVER_REQUIREMENTS.maxWidth,
      height: metadata.height || COVER_REQUIREMENTS.maxHeight,
      format: COVER_REQUIREMENTS.format,
      fileSize: processed.length,
    };
  } catch (error) {
    console.error("Cover image processing error:", error);
    throw new Error(`Failed to process cover image: ${error.message}`);
  }
}

// Define the return type to match the function
interface ProcessedCoverImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}
