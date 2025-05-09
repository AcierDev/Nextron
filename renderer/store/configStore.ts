import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  HardwareConfig,
  ConfiguredComponent,
  ComponentStates,
  SavedConfigDocument,
  FullConfigDataIPC,
} from "../../common/types";

// Define our expected IPC handler structure locally
export interface AppIPCHandler {
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
}

// Access window.ipc and assert its type for our use
const ipc = window.ipc as AppIPCHandler;

const initialHardwareConfig: HardwareConfig = {
  servos: [],
  steppers: [],
  sensors: [],
  relays: [],
  pins: [],
};

type ConfigState = {
  currentConfigId: string | null;
  currentConfigName: string | null;
  currentConfigDescription: string | null;
  hardwareConfig: HardwareConfig;
  componentStates: ComponentStates;
  isConfigLoading: boolean;
  isConfigSaving: boolean;
  isConfigLoaded: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
};

type ConfigActions = {
  _clearMessages: () => void; // Internal helper
  setError: (message: string | null) => void;
  setInfo: (message: string | null) => void;
  loadConfig: (configId: string) => Promise<void>;
  saveConfig: () => Promise<void>;
  updateComponentSetting: (
    componentId: string,
    componentGroup: keyof HardwareConfig,
    newSettings: Partial<ConfiguredComponent>
  ) => void;
  addComponent: (
    component: ConfiguredComponent,
    componentGroup: keyof HardwareConfig,
    sendConfigureMessage?: (group: keyof HardwareConfig, payload: any) => void // Optional callback to send WS message
  ) => void;
  removeComponent: (
    componentId: string,
    componentGroup: keyof HardwareConfig,
    sendRemoveMessage?: (group: keyof HardwareConfig, id: string) => void // Optional callback
  ) => void;
  duplicateComponent: (
    componentId: string,
    componentGroup: keyof HardwareConfig,
    sendConfigureMessage?: (group: keyof HardwareConfig, payload: any) => void // Optional callback
  ) => void;
  updateComponentRuntimeState: (
    componentId: string,
    value: number | string | boolean
  ) => void;
  clearConfigStore: () => void;
};

export const useConfigStore = create<ConfigState & ConfigActions>()(
  immer((set, get) => ({
    // Initial State
    currentConfigId: null,
    currentConfigName: null,
    currentConfigDescription: null,
    hardwareConfig: initialHardwareConfig,
    componentStates: {},
    isConfigLoading: false,
    isConfigSaving: false,
    isConfigLoaded: false,
    errorMessage: null,
    infoMessage: null,

    // Internal Actions
    _clearMessages: () => {
      set((state) => {
        state.errorMessage = null;
        state.infoMessage = null;
      });
    },

    // Public Actions
    setError: (message) => {
      set((state) => {
        state.errorMessage = message;
        state.infoMessage = null; // Clear info messages on error
      });
      // Optional: Auto-clear error after delay
      if (message) {
        setTimeout(() => {
          if (get().errorMessage === message) {
            set((state) => {
              state.errorMessage = null;
            });
          }
        }, 5000);
      }
    },

    setInfo: (message) => {
      set((state) => {
        state.infoMessage = message;
        state.errorMessage = null; // Clear errors on info
      });
      // Optional: Auto-clear info after delay
      if (message) {
        setTimeout(() => {
          if (get().infoMessage === message) {
            set((state) => {
              state.infoMessage = null;
            });
          }
        }, 3000);
      }
    },

    loadConfig: async (configId) => {
      get()._clearMessages();
      set((state) => {
        state.isConfigLoading = true;
        state.isConfigLoaded = false;
        state.currentConfigId = configId; // Set ID early
        // Reset other fields while loading
        state.currentConfigName = null;
        state.currentConfigDescription = null;
        state.hardwareConfig = initialHardwareConfig;
        state.componentStates = {};
      });
      try {
        console.log(`[ConfigStore] Loading config ${configId} via IPC...`);
        const data: FullConfigDataIPC = await ipc.invoke(
          "get-config-by-id",
          configId
        );
        if (!data)
          throw new Error("Configuration not found or failed to load.");

        // Normalize hardware config (ensure arrays exist)
        const normalizedHardware: HardwareConfig = {
          servos: data.hardware?.servos ?? [],
          steppers: data.hardware?.steppers ?? [],
          pins: data.hardware?.pins ?? [],
          sensors: data.hardware?.sensors ?? [],
          relays: data.hardware?.relays ?? [],
        };

        set((state) => {
          state.currentConfigName = data.name;
          state.currentConfigDescription = data.description || null;
          state.hardwareConfig = normalizedHardware;
          state.isConfigLoaded = true;
          state.isConfigLoading = false;
        });
        console.log("[ConfigStore] Config loaded:", data.name);
      } catch (error: any) {
        console.error("[ConfigStore] Error loading configuration:", error);
        set((state) => {
          state.errorMessage = `Failed to load config: ${error.message}`;
          state.isConfigLoading = false;
          state.isConfigLoaded = false;
          state.currentConfigId = null; // Clear ID on failure
          state.hardwareConfig = initialHardwareConfig;
        });
      }
    },

    saveConfig: async () => {
      const configId = get().currentConfigId;
      const hardwareConfig = get().hardwareConfig;
      if (!configId) {
        get().setError("Cannot save: No configuration loaded.");
        return;
      }
      get()._clearMessages();
      set((state) => {
        state.isConfigSaving = true;
      });
      try {
        console.log(`[ConfigStore] Saving config ${configId} via IPC...`);
        const payloadToSave: Partial<SavedConfigDocument> = {
          hardware: hardwareConfig,
        };
        const updatedConfigData = await ipc.invoke(
          "update-config",
          configId,
          payloadToSave
        );
        console.log("[ConfigStore] Save successful:", updatedConfigData);
        set((state) => {
          state.isConfigSaving = false;
          // Optionally update name/description if backend returns them
          if (updatedConfigData.name)
            state.currentConfigName = updatedConfigData.name;
          state.infoMessage = `Configuration '${
            get().currentConfigName
          }' saved.`;
        });
      } catch (error: any) {
        console.error("[ConfigStore] Error saving configuration:", error);
        set((state) => {
          state.isConfigSaving = false;
          state.errorMessage = `Save failed: ${error.message}`;
        });
      }
    },

    updateComponentSetting: (componentId, componentGroup, newSettings) => {
      set((state) => {
        const group = state.hardwareConfig[componentGroup];
        const componentIndex = group.findIndex((c) => c.id === componentId);
        if (componentIndex > -1) {
          // Merge new settings into the existing component object
          group[componentIndex] = { ...group[componentIndex], ...newSettings };
          console.log(
            `[ConfigStore] Updated settings for ${componentGroup} ${componentId}:`,
            newSettings
          );
        } else {
          console.warn(
            `[ConfigStore] Component ${componentId} not found in group ${componentGroup} for update.`
          );
        }
      });
      // Note: Saving is NOT automatic here. User must click Save.
      // Note: Sending config updates to firmware on every setting change might be desired
      // but is not implemented here. Dashboard or Card component would handle that via sendMessage prop.
    },

    addComponent: (component, componentGroup, sendConfigureMessage) => {
      set((state) => {
        state.hardwareConfig[componentGroup].push(component);
        console.log(
          `[ConfigStore] Added ${componentGroup}: ${component.name} (ID: ${component.id})`
        );
      });
      get().setInfo(`Component ${component.name} added. Remember to Save.`);
      // Optional: Immediately send configure message to firmware
      if (sendConfigureMessage) {
        // Construct payload needed by firmware's configure action
        const firmwarePayload = { ...component }; // Adapt as needed
        delete (firmwarePayload as any).isHoming; // Don't send runtime state usually
        // Add specific pin mapping if needed (e.g., pulPin, dirPin)
        // ... logic to adapt 'component' to the structure expected by firmware ...
        // sendConfigureMessage(componentGroup, firmwarePayload);
        console.warn(
          "[ConfigStore] Firmware configure message sending from addComponent not fully implemented."
        );
      }
    },

    removeComponent: (componentId, componentGroup, sendRemoveMessage) => {
      const componentName = get().hardwareConfig[componentGroup].find(
        (c) => c.id === componentId
      )?.name;
      set((state) => {
        state.hardwareConfig[componentGroup] = state.hardwareConfig[
          componentGroup
        ].filter((c) => c.id !== componentId);
        // Remove from runtime states as well
        delete state.componentStates[componentId];
        console.log(
          `[ConfigStore] Removed ${componentGroup}: ${componentName} (ID: ${componentId})`
        );
      });
      get().setInfo(`Component ${componentName} removed. Remember to Save.`);
      // Optional: Send remove message to firmware
      if (sendRemoveMessage) {
        sendRemoveMessage(componentGroup, componentId);
      }
    },

    duplicateComponent: (componentId, componentGroup, sendConfigureMessage) => {
      const sourceComponent = get().hardwareConfig[componentGroup].find(
        (c) => c.id === componentId
      );
      if (!sourceComponent) {
        console.error(
          `[ConfigStore] Cannot duplicate: Component ${componentId} not found in ${componentGroup}.`
        );
        get().setError(`Failed to find component ${componentId} to duplicate.`);
        return;
      }

      const newId = `${sourceComponent.type.toLowerCase()}-${Date.now()}`;
      const newName = `${sourceComponent.name} (Copy)`;

      const duplicatedComponent: ConfiguredComponent = {
        ...sourceComponent,
        id: newId,
        name: newName,
      };

      get().addComponent(
        duplicatedComponent,
        componentGroup,
        sendConfigureMessage
      ); // Re-use addComponent logic
      get().setInfo(`Component ${newName} duplicated. Remember to Save.`);
      // Note: addComponent handles the setInfo message and optional firmware message sending.
    },

    updateComponentRuntimeState: (componentId, value) => {
      set((state) => {
        state.componentStates[componentId] = value;
      });
      // No console log here to avoid flooding for frequent updates
    },

    clearConfigStore: () => {
      set({
        currentConfigId: null,
        currentConfigName: null,
        currentConfigDescription: null,
        hardwareConfig: initialHardwareConfig,
        componentStates: {},
        isConfigLoading: false,
        isConfigSaving: false,
        isConfigLoaded: false,
        errorMessage: null,
        infoMessage: null,
      });
      console.log("[ConfigStore] Store cleared.");
    },
  }))
);

// Optional: Selector for available IO pins (example)
export const selectAvailableIoPins = (state: ConfigState) =>
  state.hardwareConfig.pins
    .filter((p) => p.type.includes("input"))
    .map((p) => ({
      id: p.id,
      name: p.name,
      pin: p.pins[0],
      pinMode: "input",
      pinType: p.type.startsWith("digital")
        ? "digital"
        : p.type.startsWith("analog")
        ? "analog"
        : "digital", // Default or add more logic
    }));

export type { ConfigState, ConfigActions };
