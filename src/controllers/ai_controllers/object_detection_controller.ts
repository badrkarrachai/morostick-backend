import { Request, Response } from "express";
import { sendSuccessResponse, sendErrorResponse } from "../../utils/response_handler_util";
import { spawn } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import sharp from "sharp";

/**
 * Detects salient objects in an image using RMBG-V1
 *
 * @param req Request containing the image file
 * @param res Response with a mask representing the detected object
 */
export const detectObject = async (req: Request, res: Response) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return sendErrorResponse({
        res,
        message: "No file uploaded",
        errorCode: "NO_FILE",
        errorDetails: "Please provide an image file in the request.",
        status: 400,
      });
    }

    // Get parameters (optional)
    const threshold = parseFloat(req.query.threshold as string) || 0.35;
    const edgeEnhancement = req.query.edge_enhancement !== "false"; // Default to true
    const colorAware = req.query.color_aware !== "false"; // Default to true

    // Validate threshold
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      return sendErrorResponse({
        res,
        message: "Invalid threshold value",
        errorCode: "INVALID_PARAMETER",
        errorDetails: "Threshold must be a number between 0 and 1",
        status: 400,
      });
    }

    // Create a unique working directory in the temp folder
    const workDir = path.join(os.tmpdir(), `rmbg-${uuidv4()}`);
    await fs.mkdir(workDir, { recursive: true });

    // Save the input image to the temp directory
    const inputPath = path.join(workDir, "input.jpg");
    await fs.writeFile(inputPath, req.file.buffer);

    // Define output path
    const outputPath = path.join(workDir, "output.png");

    try {
      // Run RMBG-V1 inference using a Python script
      const maskBuffer = await runRMBGInference(inputPath, outputPath, threshold, edgeEnhancement, colorAware);

      // Get image dimensions
      const metadata = await sharp(maskBuffer).metadata();

      // Return the mask image as base64
      const base64Mask = maskBuffer.toString("base64");

      // Return the response
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Object detected successfully",
        data: {
          success: true,
          width: metadata.width,
          height: metadata.height,
          mask: base64Mask,
          format: "png",
          threshold: threshold,
          edge_enhancement: edgeEnhancement,
          color_aware: colorAware,
        },
      });
    } finally {
      // Clean up the temporary directory
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Error cleaning up temp files:", cleanupError);
      }
    }
  } catch (error) {
    console.error("Error detecting object:", error);
    return sendErrorResponse({
      res,
      message: "Object detection failed",
      errorCode: "DETECTION_FAILED",
      errorDetails: error.message || "An error occurred during object detection",
      status: 500,
    });
  }
};

/**
 * Helper function to run RMBG-V1 inference using a Python script
 *
 * @param inputPath Path to the input image
 * @param outputPath Path where the output mask will be saved
 * @param threshold Threshold value for converting probability map to binary mask
 * @param edgeEnhancement Whether to enable edge enhancement for better detail
 * @param colorAware Whether to enable color-aware processing for better background separation
 * @returns Buffer containing the mask image
 */
async function runRMBGInference(
  inputPath: string,
  outputPath: string,
  threshold: number = 0.35,
  edgeEnhancement: boolean = true,
  colorAware: boolean = true
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Path to the Python script for RMBG-V1 inference
    const scriptPath = path.join(process.cwd(), "python", "rmbg_inference.py");

    console.log(`Running Python script: ${scriptPath}`);
    console.log(`Python version: ${process.env.PYTHON_PATH || "python3"}`);
    console.log(`Parameters: threshold=${threshold}, edge_enhancement=${edgeEnhancement}, color_aware=${colorAware}`);

    // Check if the script exists
    try {
      if (!fsSync.existsSync(scriptPath)) {
        reject(new Error(`Python script not found: ${scriptPath}`));
        return;
      }
    } catch (error) {
      reject(new Error(`Error checking Python script: ${error.message}`));
      return;
    }

    // Get Python executable from env or use default
    const pythonExecutable = process.env.PYTHON_PATH || "python3";

    // Prepare command line arguments
    const args = [
      scriptPath,
      inputPath,
      outputPath,
      threshold.toString(),
      "--edge_enhancement",
      edgeEnhancement ? "true" : "false",
      "--color_aware",
      colorAware ? "true" : "false",
    ];

    // Spawn the Python process with parameters
    const pythonProcess = spawn(pythonExecutable, args);

    let stderr = "";
    let stdout = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log(`Python stdout: ${data.toString()}`);
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error(`Python stderr: ${data.toString()}`);
    });

    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`RMBG-V1 process exited with code ${code}: ${stderr}`));
      } else {
        try {
          // Read the output mask
          const maskBuffer = await fs.readFile(outputPath);
          resolve(maskBuffer);
        } catch (error) {
          reject(new Error(`Failed to read output mask: ${error.message}`));
        }
      }
    });
  });
}
