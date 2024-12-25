import { Request, Response } from "express";
import { Category } from "../../models/category_model";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../../utils/response_handler_util";
import { validateRequest } from "../../utils/validations_util";
import { ICategory } from "../../interfaces/category_interface";
import { body } from "express-validator";
import { Types } from "mongoose";

export const createCategory = async (req: Request, res: Response) => {
  const { name, description, emoji, isActive, slug } = req.body; // Removed order from destructuring

  try {
    // Validate request
    const validationErrors = await validateRequest(
      req,
      res,
      createCategoryValidationRules
    );
    if (validationErrors !== "validation successful") {
      return sendErrorResponse({
        res,
        message: "Invalid input",
        errorCode: "INVALID_INPUT",
        errorFields: Array.isArray(validationErrors)
          ? validationErrors
          : undefined,
        errorDetails: validationErrors,
        status: 400,
      });
    }

    // Find the highest order number currently in use
    const highestOrderCategory = await Category.findOne({})
      .sort({ order: -1 })
      .select("order")
      .lean();

    const nextOrder = (highestOrderCategory?.order ?? -1) + 1;

    // Create the category with the next order number
    const category = new Category({
      name: name.trim(),
      slug:
        slug?.trim() ||
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
      description: description?.trim(),
      emoji: emoji || [],
      order: nextOrder, // Use the calculated next order
      isActive: isActive ?? true,
      stats: {
        packCount: 0,
        stickerCount: 0,
        totalViews: 0,
        totalDownloads: 0,
      },
    });

    // Save the category
    await category.save();

    return sendSuccessResponse<ICategory>({
      res,
      status: 201,
      message: "Category created successfully",
      data: category,
    });
  } catch (err) {
    console.error("Category creation error:", err);

    // Check for duplicate name/slug error
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return sendErrorResponse({
        res,
        message: `Category ${field} already exists`,
        errorCode: "DUPLICATE_CATEGORY_FIELD",
        errorDetails: `A category with this ${field} already exists. Please choose a different ${field}.`,
        status: 409,
      });
    }

    return sendErrorResponse({
      res,
      message: "Server error",
      errorCode: "SERVER_ERROR",
      errorDetails:
        "An unexpected error occurred while creating the category. Please try again later.",
      status: 500,
    });
  }
};

// Remove order from validation rules since it's handled automatically
export const createCategoryValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Category name is required")
    .isLength({ max: 50 })
    .withMessage("Category name cannot exceed 50 characters"),

  body("slug")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Slug cannot exceed 50 characters")
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage(
      "Slug must contain only lowercase letters, numbers, and hyphens"
    ),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Description cannot exceed 200 characters"),

  body("emoji")
    .optional()
    .isArray()
    .withMessage("Emoji must be an array of strings"),

  body("emoji.*")
    .optional()
    .isString()
    .withMessage("Each emoji must be a string"),

  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean value"),
];

export const createCategoryFromName = async (
  name: string,
  isGenerated: boolean
): Promise<Types.ObjectId> => {
  const normalizedName = name.trim().toLowerCase();
  const slug = normalizedName
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Try to find existing category with normalized name comparison
  const existingCategory = await Category.findOne({
    name: {
      $regex: new RegExp(`^${normalizedName}$`, "i"),
    },
  });

  if (existingCategory) {
    return existingCategory.id;
  }

  // Also check for slug match as fallback
  const categoryBySlug = await Category.findOne({ slug });
  if (categoryBySlug) {
    return categoryBySlug.id;
  }

  // Find the highest order number currently in use
  const highestOrderCategory = await Category.findOne({})
    .sort({ order: -1 })
    .select("order")
    .lean();

  const nextOrder = (highestOrderCategory?.order ?? -1) + 1;

  // Create new category
  const category = new Category({
    name: name.trim(), // Keep original case for display
    slug,
    description: `Auto-generated category for ${name} stickers`,
    emoji: [],
    order: nextOrder,
    isActive: true,
    isGenerated: isGenerated,
    stats: {
      packCount: 0,
      stickerCount: 1,
      totalViews: 0,
      totalDownloads: 0,
    },
  });

  await category.save();
  return category.id;
};
