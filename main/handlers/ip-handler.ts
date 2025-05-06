import fs from "fs";
import path from "path";
import { BrowserWindow, ipcMain, app } from "electron";

// Get the IP file path dynamically based on environment
function getIpFilePath(): string {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    // In production, use the same location as the find-ip.ts script
    const appDataPath =
      process.env.APPDATA ||
      (process.platform === "darwin"
        ? path.join(process.env.HOME || "", "Library", "Application Support")
        : path.join(process.env.HOME || "", ".config"));

    const appName = "My Nextron App"; // Should match the name in find-ip.ts
    return path.join(appDataPath, appName, ".ip_address");
  } else {
    // In development, use the project root
    return path.resolve(__dirname, "..", "..", ".ip_address");
  }
}

const IP_FILE_PATH = getIpFilePath();
let intervalId: NodeJS.Timeout | null = null;
let watchingWindow: BrowserWindow | null = null;

function checkIpFile() {
  if (!watchingWindow || watchingWindow.isDestroyed()) {
    console.log(
      "[IP Handler] Watching window is not available. Stopping check."
    );
    stopIpCheck();
    return;
  }

  console.log(`[IP Handler] Checking for IP file: ${IP_FILE_PATH}`);
  if (fs.existsSync(IP_FILE_PATH)) {
    try {
      const ipContent = fs.readFileSync(IP_FILE_PATH, "utf-8").trim();
      console.log(`[IP Handler] Found IP file content: ${ipContent}`);

      if (ipContent.startsWith("ERROR:")) {
        console.error(
          "[IP Handler] IP detection script reported error:",
          ipContent
        );
        watchingWindow.webContents.send("ip-update", { error: ipContent });
        stopIpCheck();
        // Optional: Clean up error file after sending?
        // try { fs.unlinkSync(IP_FILE_PATH); } catch {}
      } else if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ipContent)) {
        console.log("[IP Handler] Valid IP found. Sending to renderer.");
        watchingWindow.webContents.send("ip-update", { ip: ipContent });
        stopIpCheck();
        // Optional: Clean up IP file after sending?
        // try { fs.unlinkSync(IP_FILE_PATH); } catch {}
      } else {
        console.warn(
          `[IP Handler] IP file contains invalid content: ${ipContent}`
        );
        // Continue polling
      }
    } catch (err) {
      console.error("[IP Handler] Error reading IP file:", err);
      // Continue polling, maybe send error?
      // watchingWindow.webContents.send('ip-update', { error: `Error reading IP file: ${err.message}` });
      // stopIpCheck(); // Decide if reading error should stop the check
    }
  } else {
    console.log("[IP Handler] IP file not found yet.");
    // Keep polling
  }
}

function startIpCheck(window: BrowserWindow) {
  if (intervalId) {
    console.log("[IP Handler] IP check already running.");
    return;
  }
  console.log("[IP Handler] Starting IP check.");
  watchingWindow = window;

  // Check immediately
  checkIpFile();

  // Start polling if not found immediately
  if (intervalId === null) {
    // Check intervalId hasn't been cleared by immediate check
    intervalId = setInterval(checkIpFile, 2000);
  }
}

function stopIpCheck() {
  if (intervalId) {
    console.log("[IP Handler] Stopping IP check.");
    clearInterval(intervalId);
    intervalId = null;
  }
  watchingWindow = null; // Clear the reference
}

export function setupIpHandlers() {
  // Renderer requests to start watching
  ipcMain.on("start-ip-watch", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      startIpCheck(window);
    } else {
      console.error(
        "[IP Handler] Could not get window object from event sender."
      );
    }
  });

  // Renderer signals it's closing or doesn't need updates anymore
  ipcMain.on("stop-ip-watch", () => {
    stopIpCheck();
  });
}

// Optional: Clean up watcher if the app quits
// import { app } from 'electron';
// app.on('will-quit', stopIpCheck);
