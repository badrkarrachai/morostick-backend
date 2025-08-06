import { spawn } from "child_process";
import path from "path";
import fs from "fs";

interface PythonRunnerOptions {
  scriptArgs?: string[];
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  cwd?: string;
}

/**
 * Executes a Python script and returns a promise that resolves when the script completes
 *
 * @param scriptPath Relative path to the Python script from project root
 * @param options Options for script execution
 * @returns Promise that resolves with exit code
 */
export const runPythonScript = async (scriptPath: string, options: PythonRunnerOptions = {}): Promise<number> => {
  return new Promise((resolve, reject) => {
    const { scriptArgs = [], onStdout, onStderr, cwd } = options;

    // Ensure script exists
    const absoluteScriptPath = path.resolve(scriptPath);
    if (!fs.existsSync(absoluteScriptPath)) {
      return reject(new Error(`Python script not found: ${absoluteScriptPath}`));
    }

    // Spawn python process
    const pythonProcess = spawn("python3", [absoluteScriptPath, ...scriptArgs], {
      cwd: cwd || path.dirname(absoluteScriptPath),
    });

    // Handle stdout
    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (onStdout) onStdout(output);
    });

    // Handle stderr
    pythonProcess.stderr.on("data", (data) => {
      const output = data.toString();
      if (onStderr) onStderr(output);
    });

    // Handle process completion
    pythonProcess.on("close", (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });

    // Handle process errors
    pythonProcess.on("error", (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
};

/**
 * Wrapper specifically for the RMBG background removal script
 */
export const removeBackground = async (
  inputPath: string,
  outputPath: string,
  threshold: number = 0.35,
  edgeEnhancement: boolean = true,
  colorAware: boolean = true
): Promise<string> => {
  const pythonScriptPath = path.resolve("python/test_rmbg.py");

  // Prepare arguments
  const args = [
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--threshold",
    threshold.toString(),
    "--edge_enhancement",
    edgeEnhancement ? "true" : "false",
    "--color_aware",
    colorAware ? "true" : "false",
  ];

  // Collect output for debugging
  let stdoutData = "";
  let stderrData = "";

  try {
    await runPythonScript(pythonScriptPath, {
      scriptArgs: args,
      onStdout: (data) => {
        stdoutData += data;
        console.log(`[Python STDOUT] ${data}`);
      },
      onStderr: (data) => {
        stderrData += data;
        console.error(`[Python STDERR] ${data}`);
      },
    });

    // Check if output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error("Background removal completed but output file was not created");
    }

    return outputPath;
  } catch (error) {
    console.error("Background removal failed:", error);
    console.error("STDOUT:", stdoutData);
    console.error("STDERR:", stderrData);
    throw error;
  }
};
