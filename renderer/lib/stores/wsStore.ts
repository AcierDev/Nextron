import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { ConnectionStatus } from "./configStore";

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
  syncConfigWithDevice: (hardwareConfig: any) => void;

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

    syncConfigWithDevice: (hardwareConfig) => {
      if (get().connectionStatus !== "connected") {
        console.warn("[WSStore] Cannot sync config: Not connected.");
        set((state) => {
          state.errorMessage =
            "Cannot sync configuration: Not connected to device.";
        });
        return;
      }

      set((state) => {
        state.infoMessage = "Syncing configuration with device...";
      });

      console.log("[WSStore] Syncing configuration with device...");

      const allComponents = Object.values(hardwareConfig).flat();

      if (allComponents.length === 0) {
        console.log(
          "[WSStore] No components in the current configuration to sync."
        );
        set((state) => {
          state.infoMessage = "Sync complete (No components).";
        });
        return;
      }

      const componentGroups = [
        "servos",
        "steppers",
        "sensors",
        "relays",
        "pins",
      ] as const;

      componentGroups.forEach((group) => {
        // Add safety check to ensure the group exists and is an array
        if (Array.isArray(hardwareConfig[group])) {
          hardwareConfig[group].forEach((component: any) => {
            let configPayload: any = { id: component.id, name: component.name };

            switch (group) {
              case "servos":
                configPayload.pin = component.pins[0];
                if (component.minAngle !== undefined)
                  configPayload.minAngle = component.minAngle;
                if (component.maxAngle !== undefined)
                  configPayload.maxAngle = component.maxAngle;
                break;
              case "steppers":
                configPayload.pulPin = component.pins[0];
                configPayload.dirPin = component.pins[1];
                if (component.pins.length > 2 && component.pins[2] != null)
                  configPayload.enaPin = component.pins[2];
                if (component.maxSpeed !== undefined)
                  configPayload.maxSpeed = component.maxSpeed;
                if (component.acceleration !== undefined)
                  configPayload.acceleration = component.acceleration;
                break;
              case "sensors":
                configPayload.type = component.type;
                configPayload.pins = component.pins;
                break;
              case "relays":
                configPayload.pin = component.pins[0];
                configPayload.type = component.type;
                break;
              case "pins":
                configPayload.pin = component.pins[0];
                configPayload.type = component.type;
                if (component.pullMode !== undefined)
                  configPayload.pullMode = component.pullMode;
                if (component.debounceMs !== undefined)
                  configPayload.debounceMs = component.debounceMs;

                // Extract mode and pin type from the type field (e.g., "digital_input" -> mode="input", pinType="digital")
                if (component.type && component.type.includes("_")) {
                  const [pinType, mode] = component.type.split("_");
                  configPayload.mode = mode;
                  configPayload.pinType = pinType;
                }
                break;
            }

            try {
              console.log(
                `[WSStore] Sync: Sending configure for ${String(group)}: ${
                  component.name
                } (ID: ${component.id})`
              );

              // Use the sendMessage function
              get().sendMessage({
                action: "configure",
                componentGroup: group,
                config: configPayload,
              });
            } catch (error) {
              console.error(
                `[WSStore] Failed to send config for ${component.id}:`,
                error
              );
            }
          });
        } else {
          console.warn(
            `[WSStore] Hardware config group '${String(
              group
            )}' is not an array or is missing. Skipping sync for this group.`
          );
        }
      });

      console.log(
        "[WSStore] Finished sending initial configuration sync to device."
      );
      set((state) => {
        state.infoMessage = "Sync complete!";
      });
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
