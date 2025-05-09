import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { ConnectionStatus } from "./componentStore";

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
        // Send connect message to the device
        const success = await get().sendMessage({
          action: "connect",
          ipOctet,
        });

        if (success) {
          set((state) => {
            state.lastIpOctet = ipOctet;
            state.connectionStatus = "connected";
            state.infoMessage = "Connected to device successfully!";
          });
          return true;
        } else {
          set((state) => {
            state.connectionStatus = "error";
            state.errorMessage = "Failed to connect to device.";
          });
          return false;
        }
      } catch (error) {
        console.error("[WSStore] Error connecting to device:", error);
        set((state) => {
          state.connectionStatus = "error";
          state.errorMessage = `Connection error: ${(error as Error).message}`;
        });
        return false;
      }
    },

    disconnectFromDevice: () => {
      try {
        // Send a message to close the connection
        window.ipc.invoke("disconnect-ws");

        set((state) => {
          state.connectionStatus = "idle";
          state.infoMessage = "Disconnected from device.";
        });
      } catch (error) {
        console.error("[WSStore] Error disconnecting from device:", error);
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

export default useWSStore;
