import { removeBackground } from "./utils/pythonRunner";
import path from "path";

const testBackgroundRemoval = async () => {
  try {
    console.log("Testing background removal functionality...");

    // Define input and output paths
    const inputPath = path.resolve("python/test_photo.jpg");
    const outputPath = path.resolve("python/test_photo_nobg.png");

    console.log(`Input path: ${inputPath}`);
    console.log(`Output path: ${outputPath}`);

    // Execute the background removal
    console.log("Executing background removal...");
    await removeBackground(inputPath, outputPath);

    console.log(`Background removal completed successfully!`);
    console.log(`Output saved to: ${outputPath}`);
  } catch (error) {
    console.error("Test failed:", error);
  }
};

// Run the test
testBackgroundRemoval();
