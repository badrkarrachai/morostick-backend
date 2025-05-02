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
  trayIconUrl?: string;
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

// Process animated stickers efficiently with Sharp
async function processAnimatedSticker(buffer: Buffer, platform: "whatsapp"): Promise<ProcessedImage> {
  const config = PLATFORM_CONFIGS[platform].animated;
  console.log("Processing animated sticker...");

  try {
    // Get metadata to understand the GIF dimensions and frames
    const metadata = await sharp(buffer, { animated: true }).metadata();
    const frameCount = metadata.pages || 1;

    console.log(`GIF info: ${metadata.width}x${metadata.height}, ${frameCount} frames`);

    // Skip extensive processing for small GIFs that will likely be under the size limit
    const isSmallGif = buffer.length < 1.5 * config.maxSize;

    // For smaller GIFs, try optimal quality first
    if (isSmallGif) {
      try {
        const processed = await sharp(buffer, { animated: true })
          .resize(config.width, config.height, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({
            quality: 85,
            effort: 4, // Lower effort for faster processing
            lossless: false,
            force: true,
            loop: 0, // Infinite loop for WhatsApp
          })
          .toBuffer();

        if (processed.length <= config.maxSize) {
          return {
            buffer: processed,
            width: config.width,
            height: config.height,
            format: "webp",
            isAnimated: true,
          };
        }
      } catch (e) {
        console.warn("Optimal quality conversion failed:", e.message);
      }
    }

    // Adjust quality based on GIF size for faster processing
    const targetQuality = getOptimalQuality(buffer.length, config.maxSize);

    // Use optimal settings based on GIF size
    try {
      const processed = await sharp(buffer, { animated: true })
        .resize(config.width, config.height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({
          quality: targetQuality,
          effort: frameCount > 50 ? 2 : 4, // Lower effort for many frames to speed up processing
          lossless: false,
          force: true,
          loop: 0,
        })
        .toBuffer();

      if (processed.length <= config.maxSize) {
        return {
          buffer: processed,
          width: config.width,
          height: config.height,
          format: "webp",
          isAnimated: true,
        };
      }

      // If we're close to the size limit, try slight quality reduction
      if (processed.length <= config.maxSize * 1.2) {
        const reduced = await sharp(buffer, { animated: true })
          .resize(config.width, config.height, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({
            quality: targetQuality - 10,
            effort: 4,
            lossless: false,
            force: true,
            loop: 0,
          })
          .toBuffer();

        if (reduced.length <= config.maxSize) {
          return {
            buffer: reduced,
            width: config.width,
            height: config.height,
            format: "webp",
            isAnimated: true,
          };
        }
      }
    } catch (e) {
      console.warn("Main processing failed:", e.message);
    }

    // If regular processing fails, try a more aggressive approach
    // Large GIFs or many frames need more aggressive compression
    const needsAggressiveCompression = buffer.length > 3 * config.maxSize || frameCount > 50;

    if (needsAggressiveCompression) {
      try {
        // For very large GIFs or many frames, use minimum quality and effort
        const aggressive = await sharp(buffer, { animated: true })
          .resize(config.width, config.height, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({
            quality: Math.max(20, targetQuality - 30), // Aggressive but maintain some quality
            effort: 2, // Lower effort for speed
            lossless: false,
            force: true,
            loop: 0,
          })
          .toBuffer();

        if (aggressive.length <= config.maxSize) {
          return {
            buffer: aggressive,
            width: config.width,
            height: config.height,
            format: "webp",
            isAnimated: true,
          };
        }
      } catch (e) {
        console.warn("Aggressive processing failed:", e.message);
      }
    }

    // Last resort: try to extract the first frame and make a static sticker
    console.log("Unable to process as animated sticker within size limits. Creating static sticker from first frame...");
    try {
      const firstFrame = await sharp(buffer, { page: 0 })
        .resize(config.width, config.height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({
          quality: 85,
          effort: 6,
          lossless: false,
        })
        .toBuffer();

      return {
        buffer: firstFrame,
        width: config.width,
        height: config.height,
        format: "webp",
        isAnimated: false, // This is now a static sticker
      };
    } catch (e) {
      console.error("Static conversion failed:", e.message);
      throw new Error("Failed to process sticker: could not meet size requirements");
    }
  } catch (error) {
    console.error("Sticker processing failed:", error);
    throw error;
  }
}

// Helper function to determine optimal quality based on original size
function getOptimalQuality(originalSize: number, targetSize: number): number {
  // Calculate a quality value inversely proportional to how much we need to reduce the size
  const compressionRatio = originalSize / targetSize;

  if (compressionRatio <= 1.5) return 80; // Minor compression needed
  if (compressionRatio <= 3) return 70; // Moderate compression
  if (compressionRatio <= 6) return 60; // Significant compression
  if (compressionRatio <= 10) return 50; // Heavy compression
  if (compressionRatio <= 15) return 40; // Very heavy compression
  return 30; // Extreme compression
}

// Update the processGifWithSharp function to be more efficient
async function processGifWithSharp(buffer: Buffer, config: typeof PLATFORM_CONFIGS.whatsapp.animated): Promise<ProcessedImage> {
  return processAnimatedSticker(buffer, "whatsapp");
}

export const uploadToStorage = async (file: Express.Multer.File, folder: string, needsTrayIcon: boolean = false): Promise<UploadResult> => {
  try {
    // Check if file is a GIF (likely animated)
    const isGif = file.mimetype === "image/gif";
    let isAnimated = isGif;

    // For non-GIFs, check for animation using sharp
    if (!isGif) {
      try {
        const metadata = await sharp(file.buffer).metadata();
        isAnimated = metadata.pages !== undefined && metadata.pages > 1;
      } catch (err) {
        console.warn("Error detecting animation:", err);
        // If we can't detect, assume it's based on mimetype
      }
    }

    console.log(`Processing file with mimetype ${file.mimetype}, isAnimated: ${isAnimated}`);

    let processedImage: ProcessedImage;
    let trayIconImage: ProcessedImage | null = null;
    const startTime = Date.now();

    try {
      if (isAnimated) {
        // Use optimized processing for animated stickers
        processedImage = await processAnimatedSticker(file.buffer, "whatsapp");
      } else {
        processedImage = await processStaticImageProgressive(file.buffer, "whatsapp");
      }

      // Only create tray icon if needed (for first sticker in pack)
      if (needsTrayIcon) {
        trayIconImage = await createTrayIcon(file.buffer, isAnimated, "whatsapp");
      }

      const processingTime = Date.now() - startTime;
      console.log(`Sticker processed in ${processingTime}ms, final size: ${processedImage.buffer.length} bytes`);
    } catch (error) {
      console.error("Error in primary processing:", error);

      if (error.message.includes("size requirements")) {
        const maxSize = isAnimated ? PLATFORM_CONFIGS.whatsapp.animated.maxSize : PLATFORM_CONFIGS.whatsapp.static.maxSize;
        processedImage = await optimizeWebP(file.buffer, maxSize);
      } else if (isAnimated) {
        // If animated processing fails completely, try to use the first frame as a static sticker
        try {
          console.log("Trying to extract first frame as fallback...");
          const firstFrame = await sharp(file.buffer, { page: 0 })
            .resize(PLATFORM_CONFIGS.whatsapp.static.width, PLATFORM_CONFIGS.whatsapp.static.height, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ quality: 85 })
            .toBuffer();

          processedImage = {
            buffer: firstFrame,
            width: PLATFORM_CONFIGS.whatsapp.static.width,
            height: PLATFORM_CONFIGS.whatsapp.static.height,
            format: "webp",
            isAnimated: false,
          };
          console.log("Created static sticker from first frame as fallback");
        } catch (fallbackError) {
          console.error("Fallback to static also failed:", fallbackError);
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Generate unique filename
    const filename = `${folder}/${uuidv4()}.${processedImage.format}`;

    // Generate tray icon filename if we have a tray icon
    const trayIconFilename = trayIconImage ? `${folder}/tray_${uuidv4()}.${trayIconImage.format}` : null;

    // Upload sticker
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

    // Upload tray icon if we have one
    let trayIconUrl = null;
    if (trayIconImage && trayIconFilename) {
      const trayIconUpload = new Upload({
        client: s3Client,
        params: {
          Bucket: BUCKET_NAME,
          Key: trayIconFilename,
          Body: trayIconImage.buffer,
          ContentType: `image/${trayIconImage.format}`,
          ACL: "public-read",
        },
      });

      const trayIconResult = await trayIconUpload.done();
      trayIconUrl = `${config.cloudflare.r2.publicUrl}/${trayIconFilename}`;
    }

    const totalTime = Date.now() - startTime;
    console.log(`Total processing and upload time: ${totalTime}ms`);

    return {
      success: true,
      url: `${config.cloudflare.r2.publicUrl}/${filename}`,
      width: processedImage.width,
      height: processedImage.height,
      isAnimated: processedImage.isAnimated,
      format: processedImage.format as AllowedFileFormat,
      originalFormat: mimeTypeToFormat(file.mimetype),
      fileSize: processedImage.buffer.length,
      trayIconUrl: trayIconUrl,
    };
  } catch (error) {
    console.error("Error uploading to storage:", error);
    return {
      success: false,
      url: "",
      width: 0,
      height: 0,
      isAnimated: false,
      format: "webp",
      originalFormat: mimeTypeToFormat(file.mimetype),
      fileSize: 0,
    };
  }
};

// Add a very simple ffmpeg fallback that will work on most systems
async function basicFfmpegConversion(
  inputPath: string,
  outputPath: string,
  config: typeof PLATFORM_CONFIGS.whatsapp.animated
): Promise<Buffer | null> {
  try {
    console.log("Trying basic ffmpeg conversion...");

    await new Promise((resolve, reject) => {
      // The most basic command possible
      ffmpeg(inputPath)
        .outputOptions(["-vf", `scale=${config.width}:${config.height}`, "-c:v", "libwebp", "-f", "webp"])
        .output(outputPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    return await fs.readFile(outputPath);
  } catch (error) {
    console.error("Basic ffmpeg conversion failed:", error);
    return null;
  }
}

// Also add a basic fallback to the optimization function
async function optimizeAnimatedWebP(
  initialBuffer: Buffer,
  inputPath: string,
  outputPath: string,
  config: typeof PLATFORM_CONFIGS.whatsapp.animated,
  tempDir: string
): Promise<ProcessedImage> {
  // Progressive optimization attempts
  const compressionAttempts = [
    { quality: 70, fps: 20 },
    { quality: 60, fps: 15 },
    { quality: 50, fps: 12 },
    { quality: 40, fps: 10 },
  ];

  for (const attempt of compressionAttempts) {
    try {
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .size(`${config.width}x${config.height}`)
          .autopad(true)
          .fps(attempt.fps)
          .duration(config.maxDuration)
          .outputOptions([
            // Scale and pad to exact dimensions
            "-vf",
            `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
            "-c:v",
            "libwebp",
            "-lossless",
            "0",
            "-compression_level",
            "6",
            "-q:v",
            attempt.quality.toString(),
            "-loop",
            "0",
            "-an",
            "-pix_fmt",
            "yuva420p",
          ])
          .output(outputPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      const processed = await fs.readFile(outputPath);

      if (processed.length <= config.maxSize) {
        return {
          buffer: processed,
          width: config.width,
          height: config.height,
          format: "webp",
          isAnimated: true,
        };
      }
    } catch (error) {
      console.error(`Error with optimization attempt (quality: ${attempt.quality}, fps: ${attempt.fps}):`, error);
    }
  }

  // Try the most basic approach before the last resort
  const basicResult = await basicFfmpegConversion(inputPath, outputPath, config);
  if (basicResult && basicResult.length <= config.maxSize) {
    return {
      buffer: basicResult,
      width: config.width,
      height: config.height,
      format: "webp",
      isAnimated: true,
    };
  }

  // If all standard attempts failed, try one last approach: reduce colors and frames
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .size(`${config.width}x${config.height}`)
        .fps(8) // Very low FPS as last resort
        .duration(config.maxDuration)
        .outputOptions([
          // Reduce colors to save space
          "-vf",
          `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p`,
          "-c:v",
          "libwebp",
          "-lossless",
          "0",
          "-compression_level",
          "6",
          "-q:v",
          "30", // Very low quality
          "-loop",
          "0",
          "-an",
        ])
        .output(outputPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const processed = await fs.readFile(outputPath);

    if (processed.length <= config.maxSize) {
      return {
        buffer: processed,
        width: config.width,
        height: config.height,
        format: "webp",
        isAnimated: true,
      };
    }
  } catch (error) {
    console.error("Last resort optimization failed:", error);
  }

  // If all ffmpeg approaches fail, try with sharp as a final fallback
  return await processGifWithSharp(initialBuffer, config);
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

/**
 * Validates if a file meets the WhatsApp sticker requirements
 * @param file The file to validate
 * @param isAnimated Whether the sticker is animated
 * @returns Object containing validation results
 */
export async function validateStickerRequirements(
  file: Express.Multer.File,
  isAnimated: boolean = false
): Promise<{
  valid: boolean;
  issues: string[];
  metadata: {
    width?: number;
    height?: number;
    format: string;
    size: number;
    duration?: number;
  };
}> {
  const issues: string[] = [];
  const platformConfig = isAnimated ? PLATFORM_CONFIGS.whatsapp.animated : PLATFORM_CONFIGS.whatsapp.static;

  try {
    // Basic mime type validation
    if (isAnimated && file.mimetype !== "image/gif") {
      issues.push("Animated stickers must be uploaded as GIF files");
    }

    // Check file size
    const maxSize = isAnimated ? PLATFORM_CONFIGS.whatsapp.animated.maxSize : PLATFORM_CONFIGS.whatsapp.static.maxSize;

    if (file.size > maxSize * 2) {
      // Allow some margin for optimization
      issues.push(`File size (${(file.size / 1024).toFixed(1)}KB) exceeds maximum allowed (${maxSize / 1024}KB)`);
    }

    // Get image metadata
    const metadata = await sharp(file.buffer).metadata();

    // Check dimensions (before resize)
    if (metadata.width > 2048 || metadata.height > 2048) {
      issues.push(`Image dimensions (${metadata.width}x${metadata.height}) are too large`);
    }

    // For animated GIFs, check duration if possible
    if (isAnimated && metadata.pages && metadata.pages > 100) {
      issues.push("Animated sticker likely exceeds maximum allowed duration of 10 seconds");
    }

    return {
      valid: issues.length === 0,
      issues,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || "unknown",
        size: file.size,
        duration: isAnimated && metadata.pages ? metadata.pages / 20 : undefined, // Approximate duration based on frames
      },
    };
  } catch (error) {
    return {
      valid: false,
      issues: ["Failed to validate sticker: " + error.message],
      metadata: {
        format: file.mimetype.split("/")[1] || "unknown",
        size: file.size,
      },
    };
  }
}

/**
 * Creates a tray icon for WhatsApp sticker packs from a sticker
 * Requirements:
 * - Size: 96x96 pixels
 * - Format: PNG
 * - Max file size: 50KB
 *
 * @param buffer The sticker image buffer
 * @param isAnimated Whether the sticker is animated
 * @param platform The platform (only "whatsapp" is supported currently)
 * @returns The processed tray icon
 */
export async function createTrayIcon(buffer: Buffer, isAnimated: boolean = false, platform: "whatsapp" = "whatsapp"): Promise<ProcessedImage> {
  const trayConfig = PLATFORM_CONFIGS[platform].trayIcon;

  try {
    // For animated stickers, extract the first frame
    const processBuffer = isAnimated ? await sharp(buffer, { page: 0 }).toBuffer() : buffer;

    // Resize to tray icon dimensions (96x96) and convert to PNG
    const trayIconBuffer = await sharp(processBuffer)
      .resize(trayConfig.width, trayConfig.height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 }) // Highest compression to reduce file size
      .toBuffer();

    // Check if we need to further optimize for size
    if (trayIconBuffer.length > trayConfig.maxSize) {
      // For PNG, we can try reducing colors to decrease file size
      const optimizedBuffer = await sharp(trayIconBuffer)
        .png({
          compressionLevel: 9,
          quality: 80,
          palette: true,
          colors: 128, // Reduce colors for smaller file size
        })
        .toBuffer();

      if (optimizedBuffer.length <= trayConfig.maxSize) {
        return {
          buffer: optimizedBuffer,
          width: trayConfig.width,
          height: trayConfig.height,
          format: "png",
          isAnimated: false,
        };
      }
    } else {
      return {
        buffer: trayIconBuffer,
        width: trayConfig.width,
        height: trayConfig.height,
        format: "png",
        isAnimated: false,
      };
    }

    // If we cannot meet size requirements with PNG, try JPEG as fallback
    const jpegBuffer = await sharp(processBuffer)
      .resize(trayConfig.width, trayConfig.height, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background for JPEG
      })
      .jpeg({ quality: 70 })
      .toBuffer();

    if (jpegBuffer.length <= trayConfig.maxSize) {
      return {
        buffer: jpegBuffer,
        width: trayConfig.width,
        height: trayConfig.height,
        format: "jpeg",
        isAnimated: false,
      };
    }

    // If all else fails, try the lowest quality PNG possible
    const fallbackBuffer = await sharp(processBuffer)
      .resize(trayConfig.width, trayConfig.height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({
        compressionLevel: 9,
        palette: true,
        colors: 64, // Very reduced color palette
      })
      .toBuffer();

    return {
      buffer: fallbackBuffer,
      width: trayConfig.width,
      height: trayConfig.height,
      format: "png",
      isAnimated: false,
    };
  } catch (error) {
    console.error("Error creating tray icon:", error);
    throw new Error("Failed to create tray icon");
  }
}
