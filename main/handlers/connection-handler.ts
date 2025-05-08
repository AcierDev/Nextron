import { ipcMain, BrowserWindow } from "electron";
import WebSocket from "ws";
import { handleActionCompletionMessage } from "./sequence-handler";
import createLogger from "../lib/logger";

// Create a logger instance for the Connection Handler
const logger = createLogger("Connection Handler");

// Store the connection state
let connectionState = {
  connected: false,
  ipOctet: "",
  lastConnected: 0,
  websocketUrl: "",
};

// The actual WebSocket connection
let wsConnection: WebSocket | null = null;
let pingInterval: NodeJS.Timeout | null = null;

// Function to establish WebSocket connection
function connectWebSocket(url: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Clear any existing connection
    disconnectWebSocket();

    try {
      logger.info(`Connecting to WebSocket: ${url}`);
      wsConnection = new WebSocket(url);

      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (wsConnection && wsConnection.readyState !== WebSocket.OPEN) {
          logger.error("WebSocket connection timeout");
          wsConnection.close();
          wsConnection = null;
          reject(new Error("Connection timeout"));
        }
      }, 5000);

      wsConnection.on("open", () => {
        clearTimeout(connectionTimeout);
        logger.success("WebSocket connection established");

        // Start ping interval to keep connection alive
        if (pingInterval) {
          clearInterval(pingInterval);
        }

        pingInterval = setInterval(() => {
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            try {
              wsConnection.send(
                JSON.stringify({
                  action: "ping",
                  componentGroup: "system",
                  timestamp: Date.now(),
                })
              );
              logger.debug("Sent ping");
            } catch (err) {
              logger.error("Failed to send ping:", err);
            }
          } else {
            if (pingInterval) {
              clearInterval(pingInterval);
              pingInterval = null;
            }
          }
        }, 30000);

        // Update connection state
        connectionState = {
          connected: true,
          ipOctet: url.split(".").pop()?.split("/")[0] || "",
          lastConnected: Date.now(),
          websocketUrl: url,
        };

        resolve(true);
      });

      wsConnection.on("message", (data) => {
        try {
          const message = data.toString();
          logger.debug("Received message:", message);

          // Check if message looks like valid JSON (starts with { or [)
          let jsonMessage: any = null;
          let isJson =
            message.trim().startsWith("{") || message.trim().startsWith("[");

          if (isJson) {
            try {
              jsonMessage = JSON.parse(message);

              // If this is an action completion message, handle it
              if (jsonMessage.type === "actionComplete") {
                handleActionCompletionMessage(jsonMessage);
              }
            } catch (jsonError) {
              // If parsing fails, it's a plain text message, not an error
              logger.debug("Message is not valid JSON, treating as plain text");
              isJson = false;
            }
          }

          // Forward message to all renderer processes
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            if (!window.isDestroyed()) {
              // For non-JSON messages, wrap them in a simple object
              if (!isJson) {
                const wrappedMessage = JSON.stringify({
                  type: "plaintext",
                  message: message,
                  timestamp: Date.now(),
                });
                window.webContents.send("ws-message", wrappedMessage);
              } else {
                window.webContents.send("ws-message", message);
              }
            }
          });

          // If it's a pong message, update the last connected time
          if (message.includes('"action":"pong"')) {
            connectionState.lastConnected = Date.now();
          }
        } catch (err) {
          logger.error("Error processing message:", err);
        }
      });

      wsConnection.on("close", (code, reason) => {
        logger.warn(`WebSocket closed: ${code}, ${reason}`);

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }

        wsConnection = null;

        // Notify all renderer processes
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send("ws-status", {
              status: "disconnected",
              code,
              reason,
            });
          }
        });

        // Only update state if we weren't deliberately disconnecting
        if (connectionState.connected) {
          connectionState = {
            ...connectionState,
            connected: false,
          };
        }
      });

      wsConnection.on("error", (error) => {
        logger.error("WebSocket error:", error);

        // Notify all renderer processes
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send("ws-status", {
              status: "error",
              error: error.message,
            });
          }
        });

        if (connectionState.connected) {
          connectionState = {
            ...connectionState,
            connected: false,
          };
        }

        reject(error);
      });
    } catch (error) {
      logger.error("Failed to create WebSocket:", error);
      reject(error);
    }
  });
}

// Function to disconnect WebSocket
function disconnectWebSocket() {
  if (wsConnection) {
    try {
      if (wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
        logger.info("WebSocket connection closed");
      }
    } catch (err) {
      logger.error("Error closing WebSocket:", err);
    }
    wsConnection = null;
  }

  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// Function to send a message through the WebSocket
export function sendMessage(message: object): boolean {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    logger.error("Cannot send message: WebSocket not open");
    return false;
  }

  try {
    const jsonMessage = JSON.stringify(message);
    wsConnection.send(jsonMessage);
    logger.debug("Sent message:", jsonMessage);
    return true;
  } catch (err) {
    logger.error("Error sending message:", err);
    return false;
  }
}

export function setupConnectionHandlers() {
  logger.info("Setting up connection IPC handlers");

  // Connect to WebSocket
  ipcMain.handle("connect-websocket", async (_, ipOctet: string) => {
    try {
      const wsUrl = `ws://192.168.1.${ipOctet}/ws`;
      logger.info(`Attempting connection to ${wsUrl}`);
      await connectWebSocket(wsUrl);
      return { success: true, ipOctet, websocketUrl: wsUrl };
    } catch (error) {
      logger.error("Connection failed:", error);
      return { success: false, error: error.message };
    }
  });

  // Send a message through the WebSocket
  ipcMain.handle("send-ws-message", (_, message: object) => {
    const success = sendMessage(message);
    return { success };
  });

  // Disconnect WebSocket
  ipcMain.handle("disconnect-websocket", () => {
    logger.info("Disconnecting WebSocket");
    disconnectWebSocket();

    connectionState = {
      connected: false,
      ipOctet: "",
      lastConnected: 0,
      websocketUrl: "",
    };

    return { success: true };
  });

  // Get connection status
  ipcMain.handle("get-connection-status", () => {
    // If the connection was established more than 5 minutes ago,
    // we'll assume it might be stale and require reverification
    const STALE_CONNECTION_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    if (
      connectionState.connected &&
      now - connectionState.lastConnected > STALE_CONNECTION_THRESHOLD
    ) {
      logger.warn(
        `Connection considered stale (${
          (now - connectionState.lastConnected) / 1000
        }s old)`
      );
      return {
        connected: false,
        ipOctet: connectionState.ipOctet,
        websocketUrl: connectionState.websocketUrl,
        stale: true,
      };
    }

    return {
      success: true,
      connected: connectionState.connected,
      ipOctet: connectionState.ipOctet,
      lastConnected: connectionState.lastConnected,
      websocketUrl: connectionState.websocketUrl,
      readyState: wsConnection ? wsConnection.readyState : null,
    };
  });

  // Update connection timestamp (keep alive)
  ipcMain.handle("keep-connection-alive", () => {
    if (connectionState.connected) {
      connectionState.lastConnected = Date.now();
      logger.debug(
        `Connection timestamp updated: ${connectionState.lastConnected}`
      );

      // Send a ping to verify the connection is alive
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        try {
          wsConnection.send(
            JSON.stringify({
              action: "ping",
              componentGroup: "system",
              timestamp: Date.now(),
            })
          );
        } catch (err) {
          logger.error("Failed to send ping during keep-alive:", err);
          return { success: false, error: err.message };
        }
      }
    }
    return { success: true };
  });

  logger.success("Connection handlers registered");
}
