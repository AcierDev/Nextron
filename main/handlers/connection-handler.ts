import { ipcMain, BrowserWindow } from "electron";
import WebSocket from "ws";

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
      console.log(`[Connection Handler] Connecting to WebSocket: ${url}`);
      wsConnection = new WebSocket(url);

      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (wsConnection && wsConnection.readyState !== WebSocket.OPEN) {
          console.error("[Connection Handler] WebSocket connection timeout");
          wsConnection.close();
          wsConnection = null;
          reject(new Error("Connection timeout"));
        }
      }, 5000);

      wsConnection.on("open", () => {
        clearTimeout(connectionTimeout);
        console.log("[Connection Handler] WebSocket connection established");

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
              console.log("[Connection Handler] Sent ping");
            } catch (err) {
              console.error("[Connection Handler] Failed to send ping:", err);
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
          console.log("[Connection Handler] Received message:", message);

          // Forward message to all renderer processes
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            if (!window.isDestroyed()) {
              window.webContents.send("ws-message", message);
            }
          });

          // If it's a pong message, update the last connected time
          if (message.includes('"action":"pong"')) {
            connectionState.lastConnected = Date.now();
          }
        } catch (err) {
          console.error("[Connection Handler] Error processing message:", err);
        }
      });

      wsConnection.on("close", (code, reason) => {
        console.log(
          `[Connection Handler] WebSocket closed: ${code}, ${reason}`
        );

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
        console.error("[Connection Handler] WebSocket error:", error);

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
      console.error("[Connection Handler] Failed to create WebSocket:", error);
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
      }
    } catch (err) {
      console.error("[Connection Handler] Error closing WebSocket:", err);
    }
    wsConnection = null;
  }

  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// Function to send a message through the WebSocket
function sendMessage(message: object): boolean {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    console.error(
      "[Connection Handler] Cannot send message: WebSocket not open"
    );
    return false;
  }

  try {
    const jsonMessage = JSON.stringify(message);
    wsConnection.send(jsonMessage);
    console.log("[Connection Handler] Sent message:", jsonMessage);
    return true;
  } catch (err) {
    console.error("[Connection Handler] Error sending message:", err);
    return false;
  }
}

export function setupConnectionHandlers() {
  // Connect to WebSocket
  ipcMain.handle("connect-websocket", async (_, ipOctet: string) => {
    try {
      const wsUrl = `ws://192.168.1.${ipOctet}/ws`;
      await connectWebSocket(wsUrl);
      return { success: true, ipOctet, websocketUrl: wsUrl };
    } catch (error) {
      console.error("[Connection Handler] Connection failed:", error);
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
      console.log(
        `[Connection Handler] Connection considered stale (${
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

    // Add WebSocket readyState to the status
    const status = {
      ...connectionState,
      readyState: wsConnection ? wsConnection.readyState : null,
    };

    console.log("[Connection Handler] Returning connection status:", status);
    return status;
  });

  // Update connection timestamp (keep alive)
  ipcMain.handle("keep-connection-alive", () => {
    if (connectionState.connected) {
      connectionState.lastConnected = Date.now();
      console.log(
        `[Connection Handler] Connection timestamp updated: ${connectionState.lastConnected}`
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
          console.error(
            "[Connection Handler] Failed to send ping during keep-alive:",
            err
          );
          return { success: false, error: err.message };
        }
      }
    }
    return { success: true };
  });

  // Clear connection status
  ipcMain.handle("clear-connection-status", () => {
    disconnectWebSocket();

    connectionState = {
      connected: false,
      ipOctet: "",
      lastConnected: 0,
      websocketUrl: "",
    };

    console.log("[Connection Handler] Connection status cleared");
    return { success: true };
  });
}
