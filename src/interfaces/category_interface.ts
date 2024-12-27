import { Document, Types } from "mongoose";

export interface ICategory extends Document {
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
