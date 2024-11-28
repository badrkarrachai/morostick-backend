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
import { PLATFORM_CONFIGS } from "../interfaces/platform_config_interface";

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
async function processStaticImageProgressive(
  buffer: Buffer,
  platform: "whatsapp"
): Promise<ProcessedImage> {
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
async function optimizeWebP(
  buffer: Buffer,
  maxSize: number,
  initialQuality: number = 85
): Promise<ProcessedImage> {
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

export const uploadToStorage = async (
  file: Express.Multer.File,
  folder: string
): Promise<UploadResult> => {
  try {
    const metadata = await sharp(file.buffer).metadata();
    const isAnimated =
      file.mimetype.includes("gif") || metadata.pages !== undefined;
    let processedImage: ProcessedImage;

    try {
      if (isAnimated) {
        processedImage = await processAnimatedSticker(file.buffer, "whatsapp");
      } else {
        processedImage = await processStaticImageProgressive(
          file.buffer,
          "whatsapp"
        );
      }
    } catch (error) {
      if (error.message.includes("size requirements")) {
        const maxSize = isAnimated
          ? PLATFORM_CONFIGS.whatsapp.animated.maxSize
          : PLATFORM_CONFIGS.whatsapp.static.maxSize;
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
async function processAnimatedSticker(
  buffer: Buffer,
  platform: "whatsapp"
): Promise<ProcessedImage> {
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
async function processStaticImageWithFallback(
  buffer: Buffer,
  platform: "whatsapp"
): Promise<ProcessedImage> {
  try {
    // Try progressive processing first
    return await processStaticImageProgressive(buffer, platform);
  } catch (error) {
    // If progressive processing fails, try standard processing
    const result = await processStaticImage(buffer, platform);

    // If standard processing produces a file that's too large, try optimization
    if (result.buffer.length > PLATFORM_CONFIGS[platform].static.maxSize) {
      return await optimizeWebP(
        buffer,
        PLATFORM_CONFIGS[platform].static.maxSize,
        60
      );
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
