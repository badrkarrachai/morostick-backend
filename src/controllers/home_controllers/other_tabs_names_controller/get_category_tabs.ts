import { CategoryView } from "../../../interfaces/views_interface";
import { Category } from "../../../models/category_model";
import { transformCategories } from "../../../utils/responces_templates/response_views_transformer";

export const getCategoryTabsByNames = async (
  categoryNames: string[]
): Promise<CategoryView[]> => {
  // Find categories that match the provided names and are active
  const categories = await Category.find({
    name: { $in: categoryNames },
    isActive: true,
  }).sort({ order: 1 });

  // Transform the categories to the view format
  const transformedCategories = await transformCategories(categories);

  // Optional: Maintain the order of categories as specified in categoryNames
  const orderedCategories = categoryNames.reduce(
    (ordered: CategoryView[], name) => {
      const category = transformedCategories.find((cat) => cat.name === name);
      if (category) {
        ordered.push(category);
      }
      return ordered;
    },
    []
  );

  return orderedCategories;
};
