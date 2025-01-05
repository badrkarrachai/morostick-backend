// View Interfaces
export interface CreatorView {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  description?: string;
  emoji?: string[];
  trayIcon?: string;
  isActive: boolean;
  order: number;
  isGenerated: boolean;
  tabindex?: number;
  stats: {
    packCount: number;
    stickerCount: number;
    totalViews: number;
    totalDownloads: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PackView {
  id: string;
  name: string;
  description?: string;
  trayIcon?: string;
  creator: CreatorView;
  stickers: StickerView[];
  isPrivate: boolean;
  isAuthorized: boolean;
  isAnimatedPack: boolean;
  categories: CategoryView[];
  totalStickers: number;
  stats: {
    downloads: number;
    views: number;
    favorites: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface StickerView {
  id: string;
  packId: string;
  name: string;
  emojis: string[];
  thumbnailUrl: string;
  webpUrl: string;
  isAnimated: boolean;
  fileSize: number;
  creator?: CreatorView;
  dimensions: {
    width: number;
    height: number;
  };
  format: "webp" | "png";
  categories?: CategoryView[];
  position: number;
  stats: {
    downloads: number;
    views: number;
    favorites: number;
  };
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}
