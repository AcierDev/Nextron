import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

// Connection Status Type
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "fetchingIp";

interface WSStore {
  // Connection status
  connectionStatus: ConnectionStatus;
  lastIpOctet: string;
  errorMessage: string | null;
  infoMessage: string | null;

  // Actions
  sendMessage: (message: object) => Promise<boolean>;
  connectToDevice: (ipOctet: string) => Promise<boolean>;
  disconnectFromDevice: () => void;

  // Status setters
  setConnectionStatus: (status: ConnectionStatus) => void;
  setLastIpOctet: (octet: string) => void;
  setErrorMessage: (message: string | null) => void;
  setInfoMessage: (message: string | null) => void;
}

export const useWSStore = create<WSStore>()(
  immer((set, get) => ({
    // Initial state
    connectionStatus: "idle",
    lastIpOctet: "",
    errorMessage: null,
    infoMessage: null,

    // Actions
    sendMessage: async (message) => {
      try {
        console.log("[WSStore] Sending WebSocket message:", message);
        const result = await window.ipc.invoke("send-ws-message", message);

        if (!result.success) {
          console.warn("[WSStore] Failed to send message:", message);
          set((state) => {
            state.errorMessage =
              "Failed to send message to device. Please reconnect.";
          });

          // If we're supposed to be connected but sending failed, update the status
          if (get().connectionStatus === "connected") {
            set((state) => {
              state.connectionStatus = "error";
            });
          }

          return false;
        }

        return true;
      } catch (error) {
        console.error("[WSStore] Unexpected error in sendMessage:", error);
        set((state) => {
          state.errorMessage =
            "An unexpected error occurred while sending message";
        });
        return false;
      }
    },

    connectToDevice: async (ipOctet) => {
      set((state) => {
        state.connectionStatus = "connecting";
        state.errorMessage = null;
        state.infoMessage = `Connecting to device at 192.168.1.${ipOctet}...`;
      });

      try {
        // Use the main process to establish the WebSocket connection
        const result = await window.ipc.invoke("connect-websocket", ipOctet);

        if (result.success) {
          set((state) => {
            state.lastIpOctet = result.ipOctet || ipOctet; // Prefer result.ipOctet from main process
            state.connectionStatus = "connected";
            state.infoMessage = "Connected to device successfully!";
            state.errorMessage = null; // Clear any previous errors
          });
          return true;
        } else {
          set((state) => {
            state.connectionStatus = "error";
            state.errorMessage = result.error || "Failed to connect to device.";
            state.infoMessage = null;
          });
          return false;
        }
      } catch (error) {
        console.error("[WSStore] Error connecting to device:", error);
        set((state) => {
          state.connectionStatus = "error";
          state.errorMessage = `Connection error: ${(error as Error).message}`;
          state.infoMessage = null;
        });
        return false;
      }
    },

    disconnectFromDevice: () => {
      try {
        // Ask main process to close the WebSocket
        window.ipc.invoke("disconnect-websocket");
        // The 'ws-status' listener below should catch the 'disconnected' event from main.
        // Proactively set state for immediate UI feedback.
        set((state) => {
          state.connectionStatus = "idle";
          state.infoMessage = "Disconnected from device.";
          state.errorMessage = null;
          state.lastIpOctet = ""; // Clear last connected IP
        });
      } catch (error) {
        console.error("[WSStore] Error invoking disconnect-websocket:", error);
        set((state) => {
          state.errorMessage = "Error trying to disconnect from device.";
        });
      }
    },

    // Status setters
    setConnectionStatus: (status) => {
      set((state) => {
        state.connectionStatus = status;
      });
    },

    setLastIpOctet: (octet) => {
      set((state) => {
        state.lastIpOctet = octet;
      });
    },

    setErrorMessage: (message) => {
      set((state) => {
        state.errorMessage = message;
      });
    },

    setInfoMessage: (message) => {
      set((state) => {
        state.infoMessage = message;
      });
    },
  }))
);

// --- Setup IPC Listeners for wsStore ---
// These listeners are set up once when this module is imported.
// They directly update the Zustand store upon receiving IPC messages from the main process.

// Listen for WebSocket status changes from the main process
window.ipc.on("ws-status", (data: any) => {
  console.log("[WSStore] Received 'ws-status' from main process:", data);
  const { status, error, ipOctet, reason, code } = data;

  useWSStore.setState((state) => {
    if (status === "disconnected") {
      state.connectionStatus = "idle"; // Or "disconnected" if a distinct status is preferred
      state.infoMessage = `Disconnected: ${
        reason || "Connection closed."
      } (Code: ${code || "N/A"})`;
      state.errorMessage = null;
      // state.lastIpOctet = ""; // Optionally clear the last IP octet
    } else if (status === "error") {
      state.connectionStatus = "error";
      state.errorMessage = `Connection error: ${
        error || "Unknown WebSocket error"
      }`;
      state.infoMessage = null;
    } else if (status === "connected") {
      // This case might be rare if main doesn't explicitly send "connected" after initial handshake,
      // but included for completeness if it ever does (e.g., on a reconnect).
      state.connectionStatus = "connected";
      if (ipOctet) state.lastIpOctet = ipOctet;
      // Avoid overwriting a more specific connection message if one was just set.
      if (
        !state.infoMessage ||
        state.infoMessage.startsWith("Connecting to device")
      ) {
        state.infoMessage = "Connection established.";
      }
      state.errorMessage = null;
    }
  });
});

// Listen for general WebSocket messages forwarded by the main process
window.ipc.on("ws-message", (messageData: string) => {
  // Assumes messageData is a string (JSON or plaintext)
  console.log(
    "[WSStore] Received 'ws-message' from main process:",
    messageData
  );
  try {
    // The main process's connection-handler.ts already wraps plaintext messages in a JSON structure.
    const parsedMessage = JSON.parse(messageData);

    if (parsedMessage.type === "plaintext") {
      console.log(
        "[WSStore] Plaintext message from device:",
        parsedMessage.message
      );
      // Example: Display as an info message or log.
      // useWSStore.setState(state => { state.infoMessage = `Device: ${parsedMessage.message}`; });
    } else if (parsedMessage.action === "pong") {
      // console.debug("[WSStore] Pong received from device.");
      // Could update a 'lastHeartbeat' timestamp in the store if needed.
    } else if (parsedMessage.status === "ERROR" && parsedMessage.message) {
      // Handle generic error responses from device commands
      console.error(
        `[WSStore] Device reported error: ${parsedMessage.message} (ID: ${
          parsedMessage.id || "N/A"
        })`
      );
      useWSStore.setState((state) => {
        state.errorMessage = `Device Error: ${parsedMessage.message}`;
      });
    } else if (parsedMessage.status === "OK") {
      // Generic OK response, may not need global state update unless it carries specific data.
      // console.debug(`[WSStore] Device reported OK (ID: ${parsedMessage.id || 'N/A'})`, parsedMessage);
    }
    // Other specific structured messages could be handled here to update global state if necessary.
    // For example, if the device sends spontaneous status updates.
  } catch (e) {
    // This catch block is if JSON.parse(messageData) itself fails,
    // which should be unlikely if main process pre-wraps non-JSON.
    console.warn(
      "[WSStore] Received 'ws-message' that was not valid JSON or was unhandled:",
      messageData,
      e
    );
  }
});

// Optional: Initial check for existing connection status when the app loads.
// This helps sync the store if the app was reloaded while a connection was active,
// or if the main process established a connection before the renderer was fully ready.
// This is often placed in a root component like _app.tsx to run once.
/*
(async () => {
  try {
    console.log("[WSStore] Checking initial connection status with main process...");
    const connectionData = await window.ipc.invoke("get-connection-status");
    if (connectionData && connectionData.success) {
      useWSStore.setState(state => {
        if (connectionData.connected) {
          state.connectionStatus = "connected";
          state.lastIpOctet = connectionData.ipOctet || "";
          state.infoMessage = "Connection restored from previous session.";
          state.errorMessage = null;
        } else if (connectionData.stale) {
          state.connectionStatus = "idle"; // Or "error"
          state.infoMessage = "Previous connection is stale. Please reconnect.";
          state.errorMessage = null;
        }
        // If not connected and not stale, initial 'idle' state is appropriate.
      });
    } else {
      console.warn("[WSStore] Failed to get initial connection status:", connectionData?.error);
    }
  } catch (error) {
    console.error("[WSStore] Error checking initial connection status:", error);
  }
})();
*/

export default useWSStore;
