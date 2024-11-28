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
      fps: 20,
      maxDuration: 3, // seconds
      maxStickers: 30, // Maximum stickers per pack
    },
  },
  telegram: {
    static: {
      maxSize: 512 * 1024, // 512KB
      width: 512,
      height: 512,
      format: "webp",
      quality: 90,
      maxStickers: 120, // Maximum stickers per pack for Telegram
    },
    animated: {
      maxSize: 64 * 1024, // 64KB per frame
      width: 512,
      height: 512,
      format: "webp",
      fps: 30,
      maxDuration: 3, // seconds
      maxStickers: 50, // Maximum animated stickers per pack for Telegram
    },
  },
  signal: {
    static: {
      maxSize: 300 * 1024, // 300KB
      width: 512,
      height: 512,
      format: "webp",
      quality: 85,
      maxStickers: 200, // Maximum stickers per pack for Signal
    },
    animated: {
      maxSize: 1024 * 1024, // 1MB
      width: 512,
      height: 512,
      format: "webp",
      fps: 25,
      maxDuration: 3, // seconds
      maxStickers: 100, // Maximum animated stickers per pack for Signal
    },
  },
  line: {
    static: {
      maxSize: 300 * 1024, // 300KB
      width: 320,
      height: 320,
      format: "png",
      quality: 90,
      maxStickers: 40, // Maximum stickers per pack for LINE
    },
    animated: {
      maxSize: 1024 * 1024, // 1MB
      width: 320,
      height: 320,
      format: "apng",
      fps: 24,
      maxDuration: 4, // seconds
      maxStickers: 20, // Maximum animated stickers per pack for LINE
    },
  },
} as const;

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

export interface PlatformConfig {
  static: PlatformConfigStatic;
  animated: PlatformConfigAnimated;
}

export type SupportedPlatforms = keyof typeof PLATFORM_CONFIGS;

// Helper to get config for specific platform
export const getPlatformConfig = (
  platform: SupportedPlatforms
): PlatformConfig => {
  return PLATFORM_CONFIGS[platform];
};

// Validate if platform is supported
export const isSupportedPlatform = (
  platform: string
): platform is SupportedPlatforms => {
  return platform in PLATFORM_CONFIGS;
};

// Helper functions to get specific config types
export const getStaticConfig = (
  platform: SupportedPlatforms
): PlatformConfigStatic => {
  return PLATFORM_CONFIGS[platform].static;
};

export const getAnimatedConfig = (
  platform: SupportedPlatforms
): PlatformConfigAnimated => {
  return PLATFORM_CONFIGS[platform].animated;
};
