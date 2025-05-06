import { app } from "electron";
import * as path from "path";

// Determine if we're running in a packaged app
const isPackaged = app.isPackaged;

// Safely require serialport
export function safeRequireSerialport() {
  try {
    // For development, use the normal require
    if (!isPackaged) {
      return require("serialport");
    }

    // For packaged app on Windows, we need to use a custom path to find the native modules
    if (process.platform === "win32") {
      // Get the app's base directory
      const basePath = path.dirname(app.getAppPath());
      // Create paths to the native modules
      const serialportPath = path.join(basePath, "node_modules", "serialport");

      return require(serialportPath);
    }

    // For other platforms, just use the normal require
    return require("serialport");
  } catch (error) {
    console.error("Failed to load serialport:", error);
    throw new Error(`Failed to load SerialPort: ${error.message}`);
  }
}

// Safely require serialport list
export function safeRequireSerialportList() {
  try {
    if (!isPackaged) {
      return require("@serialport/list");
    }

    if (process.platform === "win32") {
      const basePath = path.dirname(app.getAppPath());
      const serialportListPath = path.join(
        basePath,
        "node_modules",
        "@serialport",
        "list"
      );

      return require(serialportListPath);
    }

    return require("@serialport/list");
  } catch (error) {
    console.error("Failed to load @serialport/list:", error);
    throw new Error(`Failed to load @serialport/list: ${error.message}`);
  }
}

// Safely require serialport bindings
export function safeRequireSerialportBindings() {
  try {
    if (!isPackaged) {
      return require("@serialport/bindings-cpp");
    }

    if (process.platform === "win32") {
      const basePath = path.dirname(app.getAppPath());
      const bindingsPath = path.join(
        basePath,
        "node_modules",
        "@serialport",
        "bindings-cpp"
      );

      return require(bindingsPath);
    }

    return require("@serialport/bindings-cpp");
  } catch (error) {
    console.error("Failed to load @serialport/bindings-cpp:", error);
    throw new Error(
      `Failed to load @serialport/bindings-cpp: ${error.message}`
    );
  }
}
