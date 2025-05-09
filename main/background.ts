import dotenv from "dotenv";
import path from "path";
import { app, ipcMain } from "electron";
import serve from "electron-serve";
import { createWindow } from "./helpers";
import { setupIpHandlers } from "./handlers/ip-handler";
import { setupConfigHandlers } from "./handlers/config-handlers";
import { setupConnectionHandlers } from "./handlers/connection-handler";
import { setupSequenceHandlers } from "./handlers/sequence-handler";
import { spawn, execSync, ChildProcess } from "child_process";
import fs from "fs";
import { SerialPort } from "serialport";
// Load environment variables from .env file at the project root
dotenv.config({ path: path.resolve(__dirname, "../.env") }); // Adjust path as needed

const isProd = process.env.NODE_ENV === "production";

// Set up proper PATH environment to find executables like PlatformIO
setupEnvironmentPath();

// Store the reference to the IP finder process
let ipFinderProcess: ChildProcess | null = null;

function setupEnvironmentPath() {
  try {
    // Get the user's shell PATH for more consistent behavior between terminal and GUI app
    const shellPathOutput = execSync("/bin/bash -l -c 'echo $PATH'")
      .toString()
      .trim();

    if (shellPathOutput) {
      // Combine with existing PATH to avoid overwriting system paths
      const currentPath = process.env.PATH || "";
      process.env.PATH = `${shellPathOutput}:${currentPath}`;
      console.log("Enhanced PATH environment:", process.env.PATH);
    }

    // Add common locations for developer tools
    const homeDir = process.env.HOME || "";
    const additionalPaths = [
      `${homeDir}/.platformio/penv/bin`,
      `${homeDir}/.local/bin`,
      `/usr/local/bin`,
      `${homeDir}/.nvm/versions/node/*/bin`, // For Node.js binaries if using nvm
    ];

    // Add these paths to PATH if they exist
    for (const additionalPath of additionalPaths) {
      if (fs.existsSync(additionalPath)) {
        process.env.PATH = `${process.env.PATH}:${additionalPath}`;
      }
    }
  } catch (error) {
    console.error("Failed to set up environment PATH:", error);
  }
}

/**
 * Start the IP finder script to detect the ESP32's IP address
 */
function startIpFinder() {
  // Kill any existing IP finder process
  stopIpFinder();

  console.log("Starting IP finder script...");

  try {
    // Get the absolute path to the find-ip script
    let scriptPath: string | null = null;
    const scriptName = isProd ? "find-ip.js" : "find-ip.ts";

    // Try multiple potential locations
    const potentialPaths = [
      // Production paths
      isProd && path.join(process.resourcesPath, "scripts", "find-ip.js"),
      // Development paths
      !isProd && path.join(process.cwd(), "scripts", "find-ip.ts"),
      path.join(app.getAppPath(), "..", "scripts", scriptName),
      path.join(__dirname, "..", "..", "scripts", scriptName),
    ].filter(Boolean) as string[];

    // Try each path
    for (const potentialPath of potentialPaths) {
      console.log(`Checking path: ${potentialPath}`);
      if (fs.existsSync(potentialPath)) {
        scriptPath = potentialPath;
        console.log(`Found script at: ${scriptPath}`);
        break;
      }
    }

    // If no script found, try both extensions as a last resort
    if (!scriptPath) {
      const baseLocations = [
        process.cwd(),
        path.join(app.getAppPath(), ".."),
        path.join(__dirname, "..", ".."),
      ];

      for (const baseLocation of baseLocations) {
        for (const ext of [".ts", ".js"]) {
          const tryPath = path.join(baseLocation, "scripts", `find-ip${ext}`);
          console.log(`Last resort check: ${tryPath}`);
          if (fs.existsSync(tryPath)) {
            scriptPath = tryPath;
            console.log(`Found script at last resort location: ${scriptPath}`);
            break;
          }
        }
        if (scriptPath) break;
      }
    }

    if (!scriptPath) {
      console.error(
        "Could not find IP finder script in any location. Aborting."
      );
      return false;
    }

    // Determine how to run the script based on extension
    const isTypeScript = scriptPath.endsWith(".ts");
    const command = isTypeScript ? "npx" : "node";
    const args = isTypeScript ? ["tsx", scriptPath] : [scriptPath];

    console.log(`Executing: ${command} ${args.join(" ")}`);

    // Set NODE_ENV for the script
    const scriptEnv = {
      ...process.env,
    };
    // Set NODE_ENV explicitly
    scriptEnv.NODE_ENV = isProd ? "production" : "development";

    // Start the IP finder script
    ipFinderProcess = spawn(command, args, {
      env: scriptEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      cwd: process.cwd(), // Ensure we're running from the correct directory
    });

    ipFinderProcess.stdout?.on("data", (data) => {
      console.log(`[IP Finder] ${data.toString().trim()}`);
    });

    ipFinderProcess.stderr?.on("data", (data) => {
      console.error(`[IP Finder Error] ${data.toString().trim()}`);
    });

    ipFinderProcess.on("close", (code) => {
      console.log(`IP finder script exited with code ${code}`);
      ipFinderProcess = null;
    });

    console.log("IP finder script started successfully");
    return true;
  } catch (error) {
    console.error("Failed to start IP finder script:", error);
    return false;
  }
}

/**
 * Stop the IP finder script if it's running
 */
function stopIpFinder() {
  if (ipFinderProcess) {
    console.log("Stopping existing IP finder process...");
    // Kill the process and all its children
    try {
      if (process.platform === "win32") {
        // Windows needs a different approach
        spawn("taskkill", ["/pid", ipFinderProcess.pid.toString(), "/f", "/t"]);
      } else {
        // Unix systems
        process.kill(-ipFinderProcess.pid, "SIGTERM");
      }
    } catch (error) {
      console.error("Error stopping IP finder process:", error);
    }
    ipFinderProcess = null;
  }
}

if (isProd) {
  serve({ directory: "app" });
} else {
  app.setPath("userData", `${app.getPath("userData")} (development)`);
}

// Function to get the path to the firmware project directory
function getFirmwareProjectPath(): string {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Hard-code the absolute path for development
    return "/Users/steelebenjamin/Documents/Everwood/Code/Nextron/firmware";
  } else {
    // In production (packaged app)
    return path.join(process.resourcesPath, "firmware");
  }
}

function getPioPath(): string {
  try {
    // Use 'which pio' to find the location of the PlatformIO executable
    const pioPath = execSync("which pio").toString().trim();
    console.log("Found PlatformIO at:", pioPath);
    return pioPath;
  } catch (error) {
    console.error("Error finding PlatformIO:", error);

    // Fallback to common locations
    const homeDir = process.env.HOME || "";
    const commonPaths = [
      `${homeDir}/.platformio/penv/bin/pio`,
      `${homeDir}/.local/bin/pio`,
      `/usr/local/bin/pio`,
    ];

    for (const pathToCheck of commonPaths) {
      try {
        if (fs.existsSync(pathToCheck)) {
          console.log("Found PlatformIO at fallback location:", pathToCheck);
          return pathToCheck;
        }
      } catch {}
    }

    // Last resort fallback
    console.warn(
      "Could not locate PlatformIO executable, falling back to 'pio'"
    );
    return "pio";
  }
}

(async () => {
  await app.whenReady();

  // Debug information about paths
  console.log("=== Path Information for Debugging ===");
  console.log("Current working directory:", process.cwd());
  console.log("App path:", app.getAppPath());
  console.log("__dirname:", __dirname);
  console.log(
    "Resources path:",
    process.resourcesPath || "Not available (development mode)"
  );

  // Check if scripts directory exists in various locations
  const potentialScriptPaths = [
    path.join(process.cwd(), "scripts"),
    path.join(app.getAppPath(), "..", "scripts"),
    path.join(__dirname, "..", "..", "scripts"),
  ];

  potentialScriptPaths.forEach((p) => {
    console.log(`Checking scripts path: ${p} - Exists: ${fs.existsSync(p)}`);
    if (fs.existsSync(p)) {
      try {
        const files = fs.readdirSync(p);
        console.log(`Files in ${p}:`, files);
      } catch (err) {
        console.error(`Error reading directory ${p}:`, err);
      }
    }
  });
  console.log("======================================");

  // Set up all handlers
  setupIpHandlers();
  setupConfigHandlers();
  setupConnectionHandlers();
  setupSequenceHandlers();

  const mainWindow = createWindow("main", {
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.setFullScreen(true);

  // Clean up on app quit
  app.on("will-quit", () => {
    stopIpFinder();
  });

  if (isProd) {
    await mainWindow.loadURL("app://./home.html");
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
  }
})();

app.on("window-all-closed", () => {
  stopIpFinder();
  app.quit();
});

ipcMain.on("message", async (event, arg) => {
  event.reply("message", `${arg} World!`);
});

// Set up IPC handlers for firmware flashing
ipcMain.handle("flash-firmware", async (event, port: string) => {
  const firmwareDir = getFirmwareProjectPath();
  console.log("Firmware directory:", firmwareDir);

  // Stop IP finder if it's running to free up the serial port
  stopIpFinder();

  // Get the PlatformIO executable path
  const pioPath = getPioPath();
  console.log("Using PlatformIO executable:", pioPath);

  return new Promise((resolve, reject) => {
    let pioProcess: ChildProcess | null = null; // Store the process reference

    // Run PlatformIO upload command with the full path
    pioProcess = spawn(pioPath, [
      "run",
      "--target",
      "upload",
      "--upload-port",
      port,
      "--project-dir",
      firmwareDir,
    ]);

    let output = "";
    let errorOutput = "";
    let firstUploadSucceeded = false;
    let anEnvironmentProcessed = false;
    let currentEnvironment = "";

    pioProcess.stdout.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`stdout: ${chunk}`);
      event.sender.send("firmware-upload-progress", chunk);

      // Check for environment processing
      if (chunk.includes("Processing esp32 (")) {
        currentEnvironment = "esp32";
        anEnvironmentProcessed = true;
      } else if (chunk.includes("Processing esp32-s3 (")) {
        currentEnvironment = "esp32-s3";
        anEnvironmentProcessed = true;
      }

      // Check for success of the first environment (esp32)
      if (
        currentEnvironment === "esp32" &&
        chunk.includes("======== [SUCCESS] Took")
      ) {
        console.log(
          "ESP32 environment succeeded. Attempting to terminate further uploads."
        );
        firstUploadSucceeded = true;
        if (pioProcess && !pioProcess.killed) {
          try {
            // Kill the main process and all its children (PlatformIO spawns esptool.py)
            // On Unix-like systems, sending SIGTERM to the negative PID of the process group kills the group.
            // For Windows, taskkill with /T is needed, but process.kill() with SIGTERM might be enough
            // if PlatformIO handles it gracefully. We'll start with SIGTERM.
            const killed = process.kill(-pioProcess.pid, "SIGTERM"); // Send SIGTERM to the process group
            console.log(
              `Attempted to kill process group ${pioProcess.pid}: ${killed}`
            );
            if (!killed) {
              // Fallback if group kill fails (e.g. permissions, or not supported as expected)
              pioProcess.kill("SIGTERM");
              console.log(
                `Fallback: Attempted to kill process ${pioProcess.pid}`
              );
            }
          } catch (err) {
            console.error("Error attempting to kill PlatformIO process:", err);
            // If killing fails, we let it run its course,
            // but still resolve positively for the frontend.
          }
        }
        // Resolve immediately for the frontend
        resolve({ success: true, output, earlyTermination: true });
      }
    });

    pioProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(`stderr: ${chunk}`);
      event.sender.send("firmware-upload-progress", chunk);

      // Check for failure of esp32-s3 if esp32 already succeeded
      if (
        firstUploadSucceeded &&
        currentEnvironment === "esp32-s3" &&
        chunk.includes("[FAILED]")
      ) {
        console.warn(
          "esp32-s3 failed after esp32 success, but we already reported success. This is expected if termination was slow."
        );
        // Do not reject here as we've already resolved for esp32 success
      }
    });

    pioProcess.on("error", (err) => {
      console.error("Failed to start PlatformIO process:", err);
      if (!firstUploadSucceeded) {
        // Only reject if we haven't already succeeded
        reject({
          success: false,
          error: `Failed to start process: ${err.message}`,
        });
      } else {
        console.log(
          "PlatformIO process error occurred after successful first upload resolution."
        );
      }
    });

    pioProcess.on("close", (code) => {
      console.log(`PlatformIO process exited with code ${code}`);
      if (firstUploadSucceeded) {
        console.log(
          "Process closed after successful first upload and termination attempt."
        );
        // Promise should have already been resolved. If not (e.g., kill failed silently and esp32-s3 ran),
        // we ensure it resolves as success because the primary target (esp32) was met.
        // This check ensures we don't call resolve multiple times if it was already called.
        // A more robust way is to check if the promise is still pending.
        // For simplicity here, we assume the resolve in stdout listener was called.
        // However, if resolve wasn't called (e.g. kill signal was too slow and esp32-s3 failed)
        // we still consider it a success because esp32 passed.
        // A better approach for promise state checking might be needed if this becomes an issue.
        // For now, we rely on firstUploadSucceeded ensuring resolve was called.
        // Let's ensure resolve is called if it wasn't for some reason due to timing.
        // This is tricky because a promise can only be resolved/rejected once.
        // A simple flag on the promise itself or a wrapper could manage this.
        // For now, the resolve in stdout should handle it.
        // If it gets here and firstUploadSucceeded is true, and resolve was not called,
        // it implies the kill was ineffective and the process ran to completion.
        // We should have already resolved.
        return;
      }

      // If it's not an early success termination, proceed with normal exit code handling
      if (code === 0) {
        // This case means all environments (if not terminated early) completed successfully
        // or the intended single environment (if specified and not esp32) succeeded.
        event.sender.send(
          "firmware-upload-progress",
          `[SUCCESS] PlatformIO process completed.`
        );
        resolve({ success: true, output });
      } else {
        // Check if an environment was processed. If not, it's a general pio error.
        if (
          !anEnvironmentProcessed &&
          errorOutput.includes("Error: Please specify `upload_port`")
        ) {
          reject({
            success: false,
            error:
              "Error: Please specify `upload_port` or ensure the serial port is available. " +
              errorOutput,
          });
        } else if (
          !anEnvironmentProcessed &&
          errorOutput.includes("pio ENOENT")
        ) {
          reject({
            success: false,
            error:
              "PlatformIO (pio) command not found. Please ensure PlatformIO is installed and in your PATH. " +
              errorOutput,
          });
        } else {
          reject({
            success: false,
            error:
              errorOutput ||
              `PlatformIO process exited with code ${code}. Full output: ${output}`,
          });
        }
      }
    });
  });
});

// Get available serial ports
ipcMain.handle("get-serial-ports", async () => {
  try {
    // You'll need to install serialport package
    const ports = await SerialPort.list();
    console.log("ports", ports);
    return ports;
  } catch (error) {
    console.error("Error listing serial ports:", error);
    return [];
  }
});

// IPC handler to start the IP finder script
ipcMain.handle("start-ip-finder", async () => {
  const success = startIpFinder();
  return { success };
});

// IPC handler to stop the IP finder script
ipcMain.handle("stop-ip-finder", async () => {
  stopIpFinder();
  return { success: true };
});

// IPC handler to start the IP finder script and wait for detection
ipcMain.handle("start-ip-finder-and-wait", async (event, timeoutMs = 30000) => {
  try {
    // First, stop any existing IP finder
    stopIpFinder();

    // Start the IP finder
    const startSuccess = startIpFinder();
    if (!startSuccess) {
      return { success: false, error: "Failed to start IP finder script" };
    }

    // Wait for IP detection
    const detected = await waitForIpDetection(timeoutMs);

    return {
      success: true,
      ipDetected: detected,
      message: detected ? "IP detected successfully" : "IP detection timed out",
    };
  } catch (error) {
    console.error("Error in start-ip-finder-and-wait:", error);
    return { success: false, error: String(error) };
  }
});

/**
 * Check if the IP finder detected an IP successfully
 * @param timeoutMs Maximum time to wait for IP detection (in milliseconds)
 * @returns Promise that resolves to true if IP was found, false if timed out
 */
function waitForIpDetection(timeoutMs = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    // Get the IP file path using the same logic as in ip-handler.ts
    const getIpFilePath = (): string => {
      const isProd = process.env.NODE_ENV === "production";

      if (isProd) {
        const appDataPath =
          process.env.APPDATA ||
          (process.platform === "darwin"
            ? path.join(
                process.env.HOME || "",
                "Library",
                "Application Support"
              )
            : path.join(process.env.HOME || "", ".config"));

        const appName = "My Nextron App";
        return path.join(appDataPath, appName, ".ip_address");
      } else {
        return path.join(process.cwd(), ".ip_address");
      }
    };

    const ipFilePath = getIpFilePath();
    console.log(`[IP Detection] Waiting for IP file at: ${ipFilePath}`);

    // Set a timeout
    const timeoutId = setTimeout(() => {
      clearInterval(checkIntervalId);
      console.log(`[IP Detection] Timed out after ${timeoutMs}ms`);
      resolve(false);
    }, timeoutMs);

    // Check for the IP file periodically
    const checkIntervalId = setInterval(() => {
      if (fs.existsSync(ipFilePath)) {
        try {
          const content = fs.readFileSync(ipFilePath, "utf-8").trim();
          // If we have a valid IP (not an error message)
          if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(content)) {
            clearTimeout(timeoutId);
            clearInterval(checkIntervalId);
            console.log(`[IP Detection] Found IP: ${content}`);
            resolve(true);
            return;
          } else if (content.startsWith("ERROR:")) {
            clearTimeout(timeoutId);
            clearInterval(checkIntervalId);
            console.error(`[IP Detection] Error in IP file: ${content}`);
            resolve(false);
            return;
          }
        } catch (error) {
          console.error(`[IP Detection] Error reading IP file:`, error);
        }
      }
    }, 1000);
  });
}
