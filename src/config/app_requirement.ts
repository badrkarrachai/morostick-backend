// Pack requirement
export const PACK_REQUIREMENTS = {
  maxStickers: 30,
  maxPreviewStickers: 5,
  nameMaxLength: 32,
  descriptionMaxLength: 512,
  maxCategories: 50,
};
// Sticker-specific constants
export const STICKER_REQUIREMENTS = {
  nameMaxLength: 100,
  maxFileSize: 5 * 1024 * 1024, // 5MB for static files
  animatedMaxFileSize: 10 * 1024 * 1024, // 10MB for animated files
  dimensions: {
    maxWidth: 10000,
    maxHeight: 10000,
    minWidth: 50,
    minHeight: 50,
  },
  maxCategories: 50,
  maxTags: 100,
  maxEmojis: 3,
  allowedFormats: ["webp", "png", "jpeg", "jpg", "gif"],
};
// Platform-specific sticker requirements
export const PLATFORM_CONFIGS = {
  whatsapp: {
    static: {
      maxSize: 100 * 1024, // 100KB
      width: 512,
      height: 512,
      format: "webp",
      quality: 85,
      maxStickers: 30, // Maximum stickers per pack
    },
    animated: {
      maxSize: 500 * 1024, // 500KB
      width: 512,
      height: 512,
      format: "webp",
      fps: 25, // Max FPS (8ms minimum frame duration)
      maxDuration: 10, // seconds (official WhatsApp limit)
      minFrameDuration: 8, // milliseconds
      maxStickers: 30, // Maximum stickers per pack
    },
    trayIcon: {
      width: 96,
      height: 96,
      format: "png",
      maxSize: 50 * 1024, // 50KB max file size
    },
  },
} as const;
// User avatars requirements
export const UPLOAD_USER_AVATAR_REQUIREMENTS = {
  maxSize: 5 * 1024 * 1024, // 5MB max file size
  dimensions: {
    maxWidth: 2048,
    maxHeight: 2048,
    minWidth: 150,
    minHeight: 150,
  },
  allowedFormats: ["webp", "png", "jpeg", "jpg", "gif"],
};

export const UPLOAD_COVER_IMAGE_REQUIREMENTS = {
  maxSize: 8 * 1024 * 1024, // 8MB max file size
  dimensions: {
    maxWidth: 2560,
    maxHeight: 1080,
    minWidth: 800,
    minHeight: 250,
  },
  allowedFormats: ["webp", "png", "jpeg", "jpg", "gif"],
};

// User avatars requirements to cloud
export const AVATAR_REQUIREMENTS = {
  maxSize: 5 * 1024 * 1024, // 5MB max file size
  maxWidth: 1024,
  maxHeight: 1024,
  format: "webp",
};

// Cover image requirements to cloud
export const COVER_REQUIREMENTS = {
  maxWidth: 1500,
  maxHeight: 600,
  maxSize: 5 * 1024 * 1024, // 2MB, adjust as needed
  format: "jpeg",
};

// Updated type definitions
export interface PlatformConfigStatic {
  maxSize: number;
  width: number;
  height: number;
  format: string;
  quality: number;
  maxStickers: number;
}

export interface PlatformConfigAnimated {
  maxSize: number;
  width: number;
  height: number;
  format: string;
  fps: number;
  maxDuration: number;
  maxStickers: number;
}

export interface TrayIconConfig {
  width: number;
  height: number;
  format: string;
  maxSize: number;
}

export interface PlatformConfig {
  static: PlatformConfigStatic;
  animated: PlatformConfigAnimated;
  trayIcon: TrayIconConfig;
}

export type SupportedPlatforms = keyof typeof PLATFORM_CONFIGS;

// Helper to get config for specific platform
export const getPlatformConfig = (platform: SupportedPlatforms): PlatformConfig => {
  return PLATFORM_CONFIGS[platform];
};

// Validate if platform is supported
export const isSupportedPlatform = (platform: string): platform is SupportedPlatforms => {
  return platform in PLATFORM_CONFIGS;
};

// Helper functions to get specific config types
export const getStaticConfig = (platform: SupportedPlatforms): PlatformConfigStatic => {
  return PLATFORM_CONFIGS[platform].static;
};

export const getAnimatedConfig = (platform: SupportedPlatforms): PlatformConfigAnimated => {
  return PLATFORM_CONFIGS[platform].animated;
};
