import { IImages } from "../../interfaces/image_interface";

/**
 * Utility function to format image data for responses.
 *
 * @param image - The image object from the database.
 * @returns The formatted image data object.
 */
export function formatImageData(image: any): Record<string, any> {
  // Construct and return the formatted response
  return {
    id: image.id,
    name: image.name,
    url: image.url,
    isDeleted: image.isDeleted,
    deletedAt: image.deletedAt,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
  };
}
