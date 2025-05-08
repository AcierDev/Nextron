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
    // Run PlatformIO upload command with the full path
    const process = spawn(pioPath, [
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

    process.stdout.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`stdout: ${chunk}`);

      // Send real-time output to renderer
      event.sender.send("firmware-upload-progress", chunk);
    });

    process.stderr.on("data", (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(`stderr: ${chunk}`);

      // Also send stderr to renderer
      event.sender.send("firmware-upload-progress", chunk);
    });

    process.on("close", (code) => {
      if (code === 0) {
        // Send final success message
        event.sender.send(
          "firmware-upload-progress",
          "[SUCCESS] Took X seconds"
        );
        resolve({ success: true, output });
      } else {
        reject({
          success: false,
          error: errorOutput || `Process exited with code ${code}`,
        });
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
