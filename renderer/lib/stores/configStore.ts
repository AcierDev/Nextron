import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  HardwareConfig,
  FullConfigDataIPC,
  SavedConfigDocument,
} from "../../../common/types";
import useComponentStore from "./componentStore";

// Define the initial empty hardware config
const initialHardwareConfig: HardwareConfig = {
  servos: [],
  steppers: [],
  sensors: [],
  relays: [],
  pins: [],
};

// Type for configurations page list items
export type ConfigListItem = {
  _id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  hardware?: {
    servos?: any[];
    steppers?: any[];
    pins?: any[];
  };
};

// Component display types (moved from componentStore)
export type StepperMotorDisplay = {
  id: string;
  type: "stepper";
  name: string;
  position: number;
  speed: number;
  acceleration: number;
  stepsPerInch: number;
  minPosition: number;
  maxPosition: number;
  pins: {
    step: number;
    direction: number;
    enable?: number;
  };
  initialJogUnit?: "steps" | "inches";
  initialJogAmount?: number;
  initialJogAmountInches?: number;
  initialHomeSensorId?: string | null;
  initialHomingDirection?: number;
  initialHomingSpeed?: number;
  initialHomeSensorPinActiveState?: number;
  initialHomePositionOffset?: number;
};

export type ServoMotorDisplay = {
  id: string;
  type: "servo";
  name: string;
  angle: number;
  minAngle: number;
  maxAngle: number;
  pins: {
    control: number;
  };
  initialPresets?: number[];
  initialSpeed?: number;
};

export type IOPinDisplay = {
  id: string;
  type: "digital";
  name: string;
  pinNumber: number;
  mode: "input" | "output";
  pinType?: "digital" | "analog" | "pwm";
  value?: number;
  pullMode?: number;
  debounceMs?: number;
};

export type ComponentDisplay =
  | StepperMotorDisplay
  | ServoMotorDisplay
  | IOPinDisplay;

// Type for storing component states received from ESP32
export interface ComponentStates {
  [componentId: string]: number | boolean | string | undefined;
}

// Connection Status Type
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "fetchingIp";

// Define the combined store state
interface ConfigState {
  // Configurations list
  configList: ConfigListItem[];
  isLoadingConfigList: boolean;

  // Current selected config
  currentConfig: {
    id: string | null;
    name: string | null;
    description: string | null;
    isLoading: boolean;
    isLoaded: boolean;
    isSaving: boolean;
  };

  // Hardware configuration (database representation)
  hardwareConfig: HardwareConfig;

  // Component state (UI representation)
  components: ComponentDisplay[];
  componentStates: ComponentStates;
  isNewComponentDialogOpen: boolean;

  // Connection state
  connectionStatus: ConnectionStatus;
  lastIpOctet: string;

  // Messages
  errorMessage: string | null;
  infoMessage: string | null;

  // Actions
  fetchConfigurations: () => Promise<void>;
  setErrorMessage: (message: string | null) => void;
  setInfoMessage: (message: string | null) => void;
  loadConfiguration: (configId: string) => Promise<void>;
  saveConfiguration: () => Promise<boolean | undefined>;
  createConfiguration: (
    name: string,
    description?: string
  ) => Promise<string | null>;
  renameConfiguration: (configId: string, newName: string) => Promise<boolean>;
  updateConfigDescription: (
    configId: string,
    description: string
  ) => Promise<boolean>;
  deleteConfiguration: (configId: string) => Promise<boolean>;
  duplicateConfiguration: (configId: string) => Promise<string | null>;
  updateHardwareConfig: (updatedConfig: Partial<HardwareConfig>) => void;
  resetCurrentConfig: () => void;
}

// Define the store actions
interface ConfigActions {
  // Configuration actions
  fetchConfigurations: () => Promise<void>;
  loadConfiguration: (configId: string) => Promise<void>;
  saveConfiguration: () => Promise<boolean | undefined>;
  createConfiguration: (
    name: string,
    description?: string
  ) => Promise<string | null>;
  renameConfiguration: (configId: string, newName: string) => Promise<boolean>;
  updateConfigDescription: (
    configId: string,
    description: string
  ) => Promise<boolean>;
  deleteConfiguration: (configId: string) => Promise<boolean>;
  duplicateConfiguration: (configId: string) => Promise<string | null>;
  updateHardwareConfig: (updatedConfig: Partial<HardwareConfig>) => void;
  resetCurrentConfig: () => void;

  // Component actions
  setComponents: (components: ComponentDisplay[]) => void;
  updateComponentState: (
    componentId: string,
    value: number | boolean | string
  ) => void;
  addComponent: (component: ComponentDisplay) => void;
  removeComponent: (componentId: string) => void;
  duplicateComponent: (componentId: string) => void;
  updateStepperSettings: (
    motorId: string,
    settings: Partial<{
      minPosition: number;
      maxPosition: number;
      stepsPerInch: number;
      jogUnit: "steps" | "inches";
      jogAmount: number;
      jogAmountInches: number;
      speed: number;
      acceleration: number;
      homeSensorId: string | null;
      homingDirection: number;
      homingSpeed: number;
      homeSensorPinActiveState: number;
      homePositionOffset: number;
    }>
  ) => void;
  updateServoSettings: (
    servoId: string,
    settings: Partial<{
      presets: number[];
      minAngle: number;
      maxAngle: number;
      speed: number;
    }>
  ) => void;
  transformHardwareToComponents: (
    hwConfig: HardwareConfig
  ) => ComponentDisplay[];

  // UI actions
  setNewComponentDialogOpen: (isOpen: boolean) => void;

  // Connection actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  setLastIpOctet: (octet: string) => void;

  // Message actions
  setErrorMessage: (message: string | null) => void;
  setInfoMessage: (message: string | null) => void;

  // State reset
  resetState: () => void;
}

// Create the combined store
export const useConfigStore = create<ConfigState & ConfigActions>()(
  immer((set, get) => ({
    // Initial state
    configList: [],
    isLoadingConfigList: false,
    currentConfig: {
      id: null,
      name: null,
      description: null,
      isLoading: false,
      isLoaded: false,
      isSaving: false,
    },
    hardwareConfig: initialHardwareConfig,

    // Component state
    components: [],
    componentStates: {},
    isNewComponentDialogOpen: false,

    // Connection state
    connectionStatus: "idle",
    lastIpOctet: "",

    // Messages
    errorMessage: null,
    infoMessage: null,

    // Configuration actions
    fetchConfigurations: async () => {
      set((state) => {
        state.isLoadingConfigList = true;
        state.errorMessage = null;
      });

      try {
        const data = await window.ipc.invoke("get-configs");
        if (Array.isArray(data)) {
          set((state) => {
            state.configList = data;
            state.isLoadingConfigList = false;
          });
          console.log("[ConfigStore] Fetched configurations:", data.length);
        } else {
          throw new Error("Invalid data received from backend");
        }
      } catch (error) {
        console.error("[ConfigStore] Failed to fetch configurations:", error);
        set((state) => {
          state.errorMessage = `Failed to load configurations: ${
            (error as Error).message
          }`;
          state.configList = [];
          state.isLoadingConfigList = false;
        });
      }
    },

    loadConfiguration: async (configId) => {
      set((state) => {
        state.currentConfig.isLoading = true;
        state.currentConfig.isLoaded = false;
        state.errorMessage = null;
        // Reset components when loading a new config
        state.components = [];
        state.componentStates = {};
      });

      try {
        console.log(`[ConfigStore] Loading config ${configId} via IPC...`);
        const data: FullConfigDataIPC = await window.ipc.invoke(
          "get-config-by-id",
          configId
        );

        if (!data) {
          throw new Error("Configuration not found or failed to load.");
        }

        // Normalize hardware configuration
        const hardwareFromData = data.hardware;
        const normalizedHardware: HardwareConfig = {
          servos:
            hardwareFromData?.servos && Array.isArray(hardwareFromData.servos)
              ? hardwareFromData.servos
              : [],
          steppers:
            hardwareFromData?.steppers &&
            Array.isArray(hardwareFromData.steppers)
              ? hardwareFromData.steppers
              : [],
          pins:
            hardwareFromData?.pins && Array.isArray(hardwareFromData.pins)
              ? hardwareFromData.pins
              : [],
          sensors:
            hardwareFromData?.sensors && Array.isArray(hardwareFromData.sensors)
              ? hardwareFromData.sensors
              : [],
          relays:
            hardwareFromData?.relays && Array.isArray(hardwareFromData.relays)
              ? hardwareFromData.relays
              : [],
        };

        set((state) => {
          state.currentConfig.id = data._id;
          state.currentConfig.name = data.name;
          state.currentConfig.description = data.description || null;
          state.currentConfig.isLoading = false;
          state.currentConfig.isLoaded = true;
          state.hardwareConfig = normalizedHardware;
        });

        // Transform hardware to components internally
        get().transformHardwareToComponents(normalizedHardware);
      } catch (error) {
        console.error("[ConfigStore] Error loading configuration:", error);
        set((state) => {
          state.errorMessage = `Failed to load configuration: ${
            (error as Error).message
          }`;
          state.currentConfig.isLoading = false;
          state.currentConfig.isLoaded = false;
          state.currentConfig.id = null;
          state.currentConfig.name = null;
          state.currentConfig.description = null;
          state.hardwareConfig = initialHardwareConfig;
          state.components = [];
          state.componentStates = {};
        });
      }
    },

    saveConfiguration: async () => {
      const { currentConfig, hardwareConfig } = get();

      if (!currentConfig.id) {
        set((state) => {
          state.errorMessage = "Cannot save: No configuration loaded.";
        });
        return;
      }

      set((state) => {
        state.currentConfig.isSaving = true;
        state.errorMessage = null;
        state.infoMessage = "Saving configuration...";
      });

      try {
        console.log(
          `[ConfigStore] Saving config ${currentConfig.id} via IPC...`
        );

        // Prepare the payload
        const payloadToSave: Partial<SavedConfigDocument> = {
          hardware: hardwareConfig,
        };

        console.log(
          "[ConfigStore] payloadToSave",
          JSON.stringify(payloadToSave, null, 2)
        );

        const updatedConfigData = await window.ipc.invoke(
          "update-config",
          currentConfig.id,
          payloadToSave
        );

        console.log("[ConfigStore] Save successful:", updatedConfigData);

        set((state) => {
          state.infoMessage = `Configuration '${currentConfig.name}' saved successfully!`;
          state.currentConfig.isSaving = false;
        });

        return true;
      } catch (error) {
        console.error("[ConfigStore] Error saving configuration:", error);
        set((state) => {
          state.errorMessage = `Failed to save configuration: ${
            (error as Error).message
          }`;
          state.infoMessage = null;
          state.currentConfig.isSaving = false;
        });

        return false;
      }
    },

    createConfiguration: async (name, description = "") => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        set((state) => {
          state.errorMessage = "Configuration name cannot be empty.";
        });
        return null;
      }

      try {
        console.log(`[ConfigStore] Creating config: ${trimmedName}`);
        const newConfig = await window.ipc.invoke(
          "create-config",
          trimmedName,
          description
        );

        if (!newConfig || !newConfig._id) {
          throw new Error("Backend did not return a valid new configuration.");
        }

        // Update the configurations list
        set((state) => {
          state.configList.push({
            _id: newConfig._id,
            name: newConfig.name,
            description: newConfig.description,
            updatedAt: newConfig.updatedAt,
          });
          state.infoMessage = `Configuration '${newConfig.name}' created.`;
        });

        return newConfig._id;
      } catch (error) {
        console.error("[ConfigStore] Failed to create configuration:", error);
        set((state) => {
          state.errorMessage = `Create failed: ${(error as Error).message}`;
        });
        return null;
      }
    },

    renameConfiguration: async (configId, newName) => {
      const trimmedNewName = newName.trim();
      if (!configId || !trimmedNewName) {
        set((state) => {
          state.errorMessage = !configId
            ? "Error: No config ID for rename."
            : "Please enter a valid new name.";
        });
        return false;
      }

      try {
        console.log(
          `[ConfigStore] Renaming config ${configId} to ${trimmedNewName}`
        );
        await window.ipc.invoke("rename-config", configId, trimmedNewName);

        // Update state
        set((state) => {
          // Update the config list
          state.configList = state.configList.map((config) =>
            config._id === configId
              ? { ...config, name: trimmedNewName }
              : config
          );

          // If this is the currently loaded config, update its name too
          if (state.currentConfig.id === configId) {
            state.currentConfig.name = trimmedNewName;
          }

          state.infoMessage = `Configuration renamed to '${trimmedNewName}'.`;
        });

        return true;
      } catch (error) {
        console.error("[ConfigStore] Failed to rename configuration:", error);
        set((state) => {
          state.errorMessage = `Rename failed: ${(error as Error).message}`;
        });
        return false;
      }
    },

    updateConfigDescription: async (configId, description) => {
      if (!configId) {
        set((state) => {
          state.errorMessage = "Error: No config ID for description update.";
        });
        return false;
      }

      try {
        console.log(
          `[ConfigStore] Updating description for config ${configId}`
        );
        await window.ipc.invoke("update-description", configId, description);

        // Update state
        set((state) => {
          // Update the config list
          state.configList = state.configList.map((config) =>
            config._id === configId ? { ...config, description } : config
          );

          // If this is the currently loaded config, update its description too
          if (state.currentConfig.id === configId) {
            state.currentConfig.description = description;
          }

          state.infoMessage = "Configuration description updated.";
        });

        return true;
      } catch (error) {
        console.error("[ConfigStore] Failed to update description:", error);
        set((state) => {
          state.errorMessage = `Update failed: ${(error as Error).message}`;
        });
        return false;
      }
    },

    deleteConfiguration: async (configId) => {
      if (!configId) {
        set((state) => {
          state.errorMessage = "Error: Config ID missing for deletion.";
        });
        return false;
      }

      try {
        console.log(`[ConfigStore] Deleting config: ${configId}`);
        await window.ipc.invoke("delete-config", configId);

        // Update state
        set((state) => {
          state.configList = state.configList.filter(
            (config) => config._id !== configId
          );

          // If the deleted config was the current config, reset the current config
          if (state.currentConfig.id === configId) {
            state.currentConfig.id = null;
            state.currentConfig.name = null;
            state.currentConfig.description = null;
            state.currentConfig.isLoaded = false;
            state.hardwareConfig = initialHardwareConfig;
            state.components = [];
            state.componentStates = {};
          }

          state.infoMessage = "Configuration deleted.";
        });

        return true;
      } catch (error) {
        console.error("[ConfigStore] Failed to delete configuration:", error);
        set((state) => {
          state.errorMessage = `Delete failed: ${(error as Error).message}`;
        });
        return false;
      }
    },

    duplicateConfiguration: async (configId) => {
      if (!configId) return null;

      try {
        console.log(`[ConfigStore] Duplicating config: ${configId}`);
        const newConfig = await window.ipc.invoke("duplicate-config", configId);

        if (!newConfig || !newConfig._id) {
          throw new Error(
            "Backend did not return a valid duplicated configuration."
          );
        }

        // Update the configurations list
        set((state) => {
          state.configList.push({
            _id: newConfig._id,
            name: newConfig.name,
            description: newConfig.description,
            updatedAt: newConfig.updatedAt,
            hardware: newConfig.hardware,
          });
          state.infoMessage = `Configuration '${newConfig.name}' created as a copy.`;
        });

        return newConfig._id;
      } catch (error) {
        console.error(
          "[ConfigStore] Failed to duplicate configuration:",
          error
        );
        set((state) => {
          state.errorMessage = `Duplication failed: ${
            (error as Error).message
          }`;
        });
        return null;
      }
    },

    updateHardwareConfig: (updatedConfig) => {
      set((state) => {
        Object.keys(updatedConfig).forEach((key) => {
          const typedKey = key as keyof HardwareConfig;
          if (updatedConfig[typedKey] !== undefined) {
            state.hardwareConfig[typedKey] = updatedConfig[typedKey]!;
          }
        });
      });
    },

    resetCurrentConfig: () => {
      set((state) => {
        state.currentConfig = {
          id: null,
          name: null,
          description: null,
          isLoading: false,
          isLoaded: false,
          isSaving: false,
        };
        state.hardwareConfig = initialHardwareConfig;
        state.components = [];
        state.componentStates = {};
        state.errorMessage = null;
        state.infoMessage = null;
      });
    },

    // Component actions
    setComponents: (components) => {
      set((state) => {
        state.components = components;
      });
    },

    updateComponentState: (componentId, value) => {
      set((state) => {
        state.componentStates[componentId] = value;

        // Also update the component in the components array
        state.components = state.components.map((component) => {
          if (component.id === componentId) {
            if (component.type === "servo" && typeof value === "number") {
              return { ...component, angle: value } as ServoMotorDisplay;
            }
            if (component.type === "stepper" && typeof value === "number") {
              return { ...component, position: value } as StepperMotorDisplay;
            }
            if (component.type === "digital" && typeof value === "number") {
              return { ...component, value } as IOPinDisplay;
            }
          }
          return component;
        });
      });
    },

    addComponent: (component) => {
      set((state) => {
        state.components.push(component);

        // Synchronize with hardware config
        if (component.type === "stepper") {
          const stepperComponent = component as StepperMotorDisplay;
          const configuredComponent = {
            id: stepperComponent.id,
            name: stepperComponent.name,
            type: "Stepper",
            pins: [
              stepperComponent.pins.step,
              stepperComponent.pins.direction,
              stepperComponent.pins.enable,
            ].filter((pin) => pin !== undefined) as number[],
            maxSpeed: stepperComponent.speed,
            acceleration: stepperComponent.acceleration,
            stepsPerInch: stepperComponent.stepsPerInch,
            minPosition: stepperComponent.minPosition,
            maxPosition: stepperComponent.maxPosition,
            jogUnit: stepperComponent.initialJogUnit,
            jogAmount: stepperComponent.initialJogAmount,
            jogAmountInches: stepperComponent.initialJogAmountInches,
            homeSensorId: stepperComponent.initialHomeSensorId,
            homingDirection: stepperComponent.initialHomingDirection,
            homingSpeed: stepperComponent.initialHomingSpeed,
            homeSensorPinActiveState:
              stepperComponent.initialHomeSensorPinActiveState,
            homePositionOffset: stepperComponent.initialHomePositionOffset,
          };
          state.hardwareConfig.steppers.push(configuredComponent);
        } else if (component.type === "servo") {
          const servoComponent = component as ServoMotorDisplay;
          const configuredComponent = {
            id: servoComponent.id,
            name: servoComponent.name,
            type: "Servo",
            pins: [servoComponent.pins.control],
            minAngle: servoComponent.minAngle,
            maxAngle: servoComponent.maxAngle,
            presets: servoComponent.initialPresets,
            speed: servoComponent.initialSpeed,
          };
          state.hardwareConfig.servos.push(configuredComponent);
        } else if (component.type === "digital") {
          const ioComponent = component as IOPinDisplay;
          const pinType = ioComponent.pinType || "digital";
          const configuredComponent = {
            id: ioComponent.id,
            name: ioComponent.name,
            type: `${pinType}_${ioComponent.mode}`,
            pins: [ioComponent.pinNumber],
            pullMode: ioComponent.pullMode,
            debounceMs: ioComponent.debounceMs,
          };
          state.hardwareConfig.pins.push(configuredComponent);
        }

        state.infoMessage = `${
          component.type === "digital" ? "IO Pin" : "Motor"
        } added. Remember to Save Configuration.`;
      });
    },

    removeComponent: (componentId) => {
      set((state) => {
        const component = state.components.find((c) => c.id === componentId);

        // Remove from components array
        state.components = state.components.filter((c) => c.id !== componentId);

        // Also remove from component states
        if (state.componentStates[componentId]) {
          delete state.componentStates[componentId];
        }

        // Synchronize with hardware config
        if (component) {
          if (component.type === "stepper") {
            state.hardwareConfig.steppers =
              state.hardwareConfig.steppers.filter((c) => c.id !== componentId);
          } else if (component.type === "servo") {
            state.hardwareConfig.servos = state.hardwareConfig.servos.filter(
              (c) => c.id !== componentId
            );
          } else if (component.type === "digital") {
            state.hardwareConfig.pins = state.hardwareConfig.pins.filter(
              (c) => c.id !== componentId
            );
          }
        }

        state.infoMessage =
          "Component removed. Remember to Save Configuration.";
      });
    },

    duplicateComponent: (componentId) => {
      const components = get().components;
      const componentToDuplicate = components.find((c) => c.id === componentId);

      if (!componentToDuplicate) {
        set((state) => {
          state.errorMessage =
            "Failed to find original component to duplicate.";
        });
        return;
      }

      const newId = `${componentToDuplicate.type}-${Date.now()}`;
      const newName = `${componentToDuplicate.name} (Copy)`;

      // Create a copy of the component with a new ID and name
      let duplicatedComponent: ComponentDisplay;

      if (componentToDuplicate.type === "stepper") {
        duplicatedComponent = {
          ...componentToDuplicate,
          id: newId,
          name: newName,
        };
      } else if (componentToDuplicate.type === "servo") {
        duplicatedComponent = {
          ...componentToDuplicate,
          id: newId,
          name: newName,
        };
      } else {
        // IO Pin
        duplicatedComponent = {
          ...componentToDuplicate,
          id: newId,
          name: newName,
        };
      }

      // Use the addComponent method to ensure hardware config stays in sync
      get().addComponent(duplicatedComponent);
    },

    updateStepperSettings: (motorId, settings) => {
      set((state) => {
        // Update UI component
        state.components = state.components.map((component) => {
          if (component.id === motorId && component.type === "stepper") {
            return {
              ...component,
              ...(settings.minPosition !== undefined && {
                minPosition: settings.minPosition,
              }),
              ...(settings.maxPosition !== undefined && {
                maxPosition: settings.maxPosition,
              }),
              ...(settings.stepsPerInch !== undefined && {
                stepsPerInch: settings.stepsPerInch,
              }),
              ...(settings.jogUnit !== undefined && {
                initialJogUnit: settings.jogUnit,
              }),
              ...(settings.jogAmount !== undefined && {
                initialJogAmount: settings.jogAmount,
              }),
              ...(settings.jogAmountInches !== undefined && {
                initialJogAmountInches: settings.jogAmountInches,
              }),
              ...(settings.speed !== undefined && { speed: settings.speed }),
              ...(settings.acceleration !== undefined && {
                acceleration: settings.acceleration,
              }),
              ...(settings.homeSensorId !== undefined && {
                initialHomeSensorId: settings.homeSensorId,
              }),
              ...(settings.homingDirection !== undefined && {
                initialHomingDirection: settings.homingDirection,
              }),
              ...(settings.homingSpeed !== undefined && {
                initialHomingSpeed: settings.homingSpeed,
              }),
              ...(settings.homeSensorPinActiveState !== undefined && {
                initialHomeSensorPinActiveState:
                  settings.homeSensorPinActiveState,
              }),
              ...(settings.homePositionOffset !== undefined && {
                initialHomePositionOffset: settings.homePositionOffset,
              }),
            } as StepperMotorDisplay;
          }
          return component;
        });

        // Also update the hardware config
        const stepperIndex = state.hardwareConfig.steppers.findIndex(
          (s) => s.id === motorId
        );

        if (stepperIndex !== -1) {
          if (settings.minPosition !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].minPosition =
              settings.minPosition;
          }
          if (settings.maxPosition !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].maxPosition =
              settings.maxPosition;
          }
          if (settings.stepsPerInch !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].stepsPerInch =
              settings.stepsPerInch;
          }
          if (settings.jogUnit !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].jogUnit =
              settings.jogUnit;
          }
          if (settings.jogAmount !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].jogAmount =
              settings.jogAmount;
          }
          if (settings.jogAmountInches !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].jogAmountInches =
              settings.jogAmountInches;
          }
          if (settings.speed !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].maxSpeed =
              settings.speed;
          }
          if (settings.acceleration !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].acceleration =
              settings.acceleration;
          }
          if (settings.homeSensorId !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].homeSensorId =
              settings.homeSensorId;
          }
          if (settings.homingDirection !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].homingDirection =
              settings.homingDirection;
          }
          if (settings.homingSpeed !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].homingSpeed =
              settings.homingSpeed;
          }
          if (settings.homeSensorPinActiveState !== undefined) {
            state.hardwareConfig.steppers[
              stepperIndex
            ].homeSensorPinActiveState = settings.homeSensorPinActiveState;
          }
          if (settings.homePositionOffset !== undefined) {
            state.hardwareConfig.steppers[stepperIndex].homePositionOffset =
              settings.homePositionOffset;
          }
        }
      });
    },

    updateServoSettings: (servoId, settings) => {
      set((state) => {
        // Update UI component
        state.components = state.components.map((component) => {
          if (component.id === servoId && component.type === "servo") {
            return {
              ...component,
              ...(settings.presets !== undefined && {
                initialPresets: settings.presets,
              }),
              ...(settings.minAngle !== undefined && {
                minAngle: settings.minAngle,
              }),
              ...(settings.maxAngle !== undefined && {
                maxAngle: settings.maxAngle,
              }),
              ...(settings.speed !== undefined && {
                initialSpeed: settings.speed,
              }),
            } as ServoMotorDisplay;
          }
          return component;
        });

        // Also update the hardware config
        const servoIndex = state.hardwareConfig.servos.findIndex(
          (s) => s.id === servoId
        );

        if (servoIndex !== -1) {
          if (settings.presets !== undefined) {
            state.hardwareConfig.servos[servoIndex].presets = settings.presets;
          }
          if (settings.minAngle !== undefined) {
            state.hardwareConfig.servos[servoIndex].minAngle =
              settings.minAngle;
          }
          if (settings.maxAngle !== undefined) {
            state.hardwareConfig.servos[servoIndex].maxAngle =
              settings.maxAngle;
          }
          if (settings.speed !== undefined) {
            state.hardwareConfig.servos[servoIndex].speed = settings.speed;
          }
        }
      });
    },

    transformHardwareToComponents: (hwConfig) => {
      const displayComponents: ComponentDisplay[] = [];

      // Transform servos
      if (hwConfig && Array.isArray(hwConfig.servos)) {
        hwConfig.servos.forEach((servo) => {
          const servoConfig = servo as any; // Type assertion for new fields
          displayComponents.push({
            id: servo.id,
            type: "servo",
            name: servo.name,
            angle: 90, // Default or last known state
            minAngle: servo.minAngle ?? 0,
            maxAngle: servo.maxAngle ?? 180,
            pins: { control: servo.pins[0] },
            initialPresets: servoConfig.presets ?? [0, 45, 90, 135, 180],
            initialSpeed: servoConfig.speed ?? 100,
          });
        });
      }

      // Transform steppers
      if (hwConfig && Array.isArray(hwConfig.steppers)) {
        hwConfig.steppers.forEach((stepper) => {
          const stepperConfig = stepper as any; // Type assertion
          displayComponents.push({
            id: stepper.id,
            type: "stepper",
            name: stepper.name,
            position: 0, // Default or last known state
            speed: stepperConfig.maxSpeed ?? 1000,
            acceleration: stepperConfig.acceleration ?? 500,
            stepsPerInch: stepperConfig.stepsPerInch ?? 2000,
            minPosition: stepperConfig.minPosition ?? -50000,
            maxPosition: stepperConfig.maxPosition ?? 50000,
            pins: {
              step: stepper.pins[0],
              direction: stepper.pins[1],
              enable: stepper.pins[2],
            },
            initialJogUnit: stepperConfig.jogUnit ?? "steps",
            initialJogAmount: stepperConfig.jogAmount ?? 200,
            initialJogAmountInches: stepperConfig.jogAmountInches ?? 0.1,
            initialHomeSensorId: stepperConfig.homeSensorId ?? null,
            initialHomingDirection: stepperConfig.homingDirection ?? 1,
            initialHomingSpeed: stepperConfig.homingSpeed ?? 1000,
            initialHomeSensorPinActiveState:
              stepperConfig.homeSensorPinActiveState ?? 0,
            initialHomePositionOffset: stepperConfig.homePositionOffset ?? 0,
          });
        });
      }

      // Transform pins
      if (hwConfig && Array.isArray(hwConfig.pins)) {
        hwConfig.pins.forEach((pin) => {
          // Extract pin properties from the component
          const mode = pin.type.includes("input") ? "input" : "output";
          let pinType: "digital" | "analog" | "pwm" = "digital";

          if (pin.type.includes("analog")) {
            pinType = "analog";
          } else if (pin.type.includes("pwm")) {
            pinType = "pwm";
          }

          const pullMode = pin.pullMode;
          const debounceMs = pin.debounceMs;

          displayComponents.push({
            id: pin.id,
            type: "digital",
            name: pin.name,
            pinNumber: pin.pins[0],
            mode: mode,
            pinType: pinType,
            value:
              mode === "input"
                ? 0
                : pinType === "digital"
                ? 0
                : pinType === "analog"
                ? 512
                : 128,
            pullMode: pullMode,
            debounceMs: debounceMs,
          });
        });
      }

      // Set the components
      set((state) => {
        state.components = displayComponents;
      });

      return displayComponents;
    },

    // UI actions
    setNewComponentDialogOpen: (isOpen) => {
      set((state) => {
        state.isNewComponentDialogOpen = isOpen;
      });
    },

    // Connection actions
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

    // Message actions
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

    // Reset the state
    resetState: () => {
      set((state) => {
        state.components = [];
        state.componentStates = {};
        state.isNewComponentDialogOpen = false;
      });
    },
  }))
);

export default useConfigStore;
