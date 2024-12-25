import { Types } from "mongoose";

export function processObject(obj: any, keysToRemove: string[] = []): any {
  // Handle null
  if (obj === null) {
    return null;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => processObject(item, keysToRemove));
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Handle ObjectId
  if (obj instanceof Types.ObjectId) {
    return obj.toString();
  }

  // Handle objects
  if (obj && typeof obj === "object") {
    // Handle ObjectId that might be wrapped in a document
    if (obj._bsontype === "ObjectID") {
      return obj.toString();
    }

    const result = Object.keys(obj).reduce((acc, key) => {
      const value = obj[key];

      // Skip keys to remove
      if (!keysToRemove.includes(key)) {
        // Convert _id to id
        const newKey = key === "_id" ? "id" : key;

        // Skip if we already have an id and this is a converted _id
        if (newKey === "id" && acc.id !== undefined) {
          return acc;
        }

        // Handle ObjectId specifically
        if (
          value instanceof Types.ObjectId ||
          value?._bsontype === "ObjectID"
        ) {
          acc[newKey] = value.toString();
        } else {
          // Process other values
          acc[newKey] =
            value instanceof Date
              ? value.toISOString()
              : typeof value === "object" && value !== null
              ? processObject(value, keysToRemove)
              : value;
        }
      }

      return acc;
    }, {} as any);

    // Reorder properties to move `id` to the top
    if (result.id) {
      const { id, ...rest } = result;
      return { id, ...rest };
    }

    return result;
  }

  return obj; // Return primitive types (string, number, etc.) as-is
}
