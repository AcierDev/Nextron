import { create } from "zustand";
import { immer } from "zustand/middleware/immer"; // Corrected import path after installing immer
import { v4 as uuidv4 } from "uuid"; // For generating unique IDs for steps and sequences
import {
  Sequence,
  SequenceStep,
  ActionStep,
  DelayStep,
  HardwareConfig,
  DeviceDisplay,
  ConfiguredComponent,
  FullConfigDataIPC, // To receive config data from main process
} from "../../common/types";

// Helper to transform ConfiguredComponent to DeviceDisplay
const transformComponentToDeviceDisplay = (
  component: ConfiguredComponent,
  group: keyof HardwareConfig
): DeviceDisplay => {
  return {
    id: component.id,
    name: component.name,
    componentGroup: group,
    originalType: component.type,
    // Add any other specific properties useful for the UI if needed
  };
};

interface SequenceState {
  currentSequence: Sequence | null;
  availableDevices: DeviceDisplay[];
  isLoading: boolean;
  error: string | null;
  activeConfigId: string | null; // To know which config this sequence belongs to
}

interface SequenceActions {
  loadConfigAndInitializeSequence: (
    configId: string,
    sequenceId?: string,
    initialNameForNewSequence?: string
  ) => Promise<void>;
  createNewSequence: (name: string, description?: string) => void;
  updateSequenceDetails: (
    details: Partial<Pick<Sequence, "name" | "description">>
  ) => void;
  addStep: (
    stepData: Omit<ActionStep, "id" | "type"> | Omit<DelayStep, "id" | "type">
  ) => void;
  updateStep: (stepId: string, updatedData: Partial<SequenceStep>) => void;
  deleteStep: (stepId: string) => void;
  reorderSteps: (steps: SequenceStep[]) => void;
  saveSequenceToConfig: () => Promise<void>; // Placeholder for now
  _setDevicesFromHardwareConfig: (hardwareConfig: HardwareConfig) => void;
  clearError: () => void;
  resetStore: () => void; // To clean up when leaving the page or changing config
}

const initialState: SequenceState = {
  currentSequence: null,
  availableDevices: [],
  isLoading: false,
  error: null,
  activeConfigId: null,
};

export const useSequenceStore = create<SequenceState & SequenceActions>()(
  immer((set, get) => ({
    ...initialState,

    _setDevicesFromHardwareConfig: (hardwareConfig) => {
      const devices: DeviceDisplay[] = [];
      (Object.keys(hardwareConfig) as Array<keyof HardwareConfig>).forEach(
        (group) => {
          if (group === "sensors") return; // Typically sensors are not actioned in sequences
          hardwareConfig[group].forEach((component) => {
            devices.push(transformComponentToDeviceDisplay(component, group));
          });
        }
      );
      set((state) => {
        state.availableDevices = devices;
      });
    },

    loadConfigAndInitializeSequence: async (
      configId,
      sequenceId,
      initialNameForNewSequence
    ) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
        state.activeConfigId = configId;
        state.currentSequence = null;
        state.availableDevices = [];
      });
      try {
        const fetchedConfigData: FullConfigDataIPC = await window.ipc.invoke(
          "get-config-by-id",
          configId
        );

        if (!fetchedConfigData) {
          throw new Error("Configuration not found.");
        }

        const configData = {
          ...fetchedConfigData,
          sequences: fetchedConfigData.sequences || [],
        };

        get()._setDevicesFromHardwareConfig(configData.hardware);

        let sequenceToLoad: Sequence | null = null;
        if (
          sequenceId &&
          sequenceId !== "new-sequence" &&
          configData.sequences
        ) {
          sequenceToLoad =
            configData.sequences.find((seq) => seq.id === sequenceId) || null;
        }

        if (sequenceToLoad) {
          set((state) => {
            state.currentSequence = sequenceToLoad;
          });
        } else if (sequenceId) {
          // Covers "new-sequence" or a non-existent ID
          const nameForNew = initialNameForNewSequence || "New Sequence";
          console.log(
            `No sequence found for ID '${sequenceId}', creating new one named: '${nameForNew}'`
          );
          get().createNewSequence(nameForNew);
        } else {
          set((state) => {
            state.currentSequence = null;
          });
        }
      } catch (err: any) {
        set((state) => {
          state.error = err.message || "Failed to load configuration.";
        });
      } finally {
        set((state) => {
          state.isLoading = false;
        });
      }
    },

    createNewSequence: (name, description = "") => {
      if (!get().activeConfigId) {
        set((state) => {
          state.error =
            "Cannot create sequence without an active configuration.";
        });
        return;
      }
      const newSequence: Sequence = {
        id: uuidv4(), // Generate a new unique ID for the sequence
        name,
        description,
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      set((state) => {
        state.currentSequence = newSequence;
        state.error = null; // Clear any previous error
      });
      // Note: This sequence is not saved to the config yet. `saveSequenceToConfig` would do that.
    },

    updateSequenceDetails: (details) => {
      const sequenceExists = !!get().currentSequence;
      const currentActiveConfigId = get().activeConfigId;

      set((state) => {
        if (state.currentSequence) {
          state.currentSequence = {
            ...state.currentSequence,
            ...details,
            updatedAt: new Date().toISOString(),
          };
        }
      });

      if (sequenceExists && currentActiveConfigId) {
        get().saveSequenceToConfig();
      } else {
        console.warn(
          "Sequence details updated in store, but not auto-saved (no current sequence or active config)."
        );
      }
    },

    addStep: (
      stepData: Omit<ActionStep, "id" | "type"> | Omit<DelayStep, "id" | "type">
    ) => {
      const sequenceExists = !!get().currentSequence;
      const currentActiveConfigId = get().activeConfigId;

      set((state) => {
        if (state.currentSequence) {
          const commonProps = { id: uuidv4() };

          if ("duration" in stepData && typeof stepData.duration === "number") {
            const delayStepData = stepData as Omit<DelayStep, "id" | "type">;
            const newDelayStep: DelayStep = {
              ...commonProps,
              type: "delay",
              duration: delayStepData.duration,
            };
            state.currentSequence.steps.push(newDelayStep);
          } else {
            const actionStepData = stepData as Omit<ActionStep, "id" | "type">;
            const newActionStep: ActionStep = {
              ...commonProps,
              type: "action",
              deviceId: actionStepData.deviceId,
              deviceComponentGroup: actionStepData.deviceComponentGroup,
              action: actionStepData.action,
              value: actionStepData.value,
              ...(actionStepData.speed !== undefined && {
                speed: actionStepData.speed,
              }),
              ...(actionStepData.acceleration !== undefined && {
                acceleration: actionStepData.acceleration,
              }),
            };
            state.currentSequence.steps.push(newActionStep);
          }
          state.currentSequence.updatedAt = new Date().toISOString();
        }
      });

      if (sequenceExists && currentActiveConfigId) {
        get().saveSequenceToConfig();
      } else {
        console.warn(
          "Step added in store, but not auto-saved (no current sequence or active config)."
        );
      }
    },

    updateStep: (stepId, updatedData) => {
      const sequenceExists = !!get().currentSequence;
      const currentActiveConfigId = get().activeConfigId;

      set((state) => {
        if (state.currentSequence) {
          const stepIndex = state.currentSequence.steps.findIndex(
            (s) => s.id === stepId
          );
          if (stepIndex !== -1) {
            // @ts-ignore
            state.currentSequence.steps[stepIndex] = {
              ...state.currentSequence.steps[stepIndex],
              ...updatedData,
            };
            state.currentSequence.updatedAt = new Date().toISOString();
          }
        }
      });

      if (sequenceExists && currentActiveConfigId) {
        get().saveSequenceToConfig();
      } else {
        console.warn(
          "Step updated in store, but not auto-saved (no current sequence or active config)."
        );
      }
    },

    deleteStep: (stepId) => {
      const sequenceExists = !!get().currentSequence;
      const currentActiveConfigId = get().activeConfigId;

      set((state) => {
        if (state.currentSequence) {
          state.currentSequence.steps = state.currentSequence.steps.filter(
            (s) => s.id !== stepId
          );
          state.currentSequence.updatedAt = new Date().toISOString();
        }
      });

      if (sequenceExists && currentActiveConfigId) {
        get().saveSequenceToConfig();
      } else {
        console.warn(
          "Step deleted in store, but not auto-saved (no current sequence or active config)."
        );
      }
    },

    reorderSteps: (steps) => {
      const sequenceExists = !!get().currentSequence;
      const currentActiveConfigId = get().activeConfigId;

      set((state) => {
        if (state.currentSequence) {
          state.currentSequence.steps = steps;
          state.currentSequence.updatedAt = new Date().toISOString();
        }
      });

      if (sequenceExists && currentActiveConfigId) {
        get().saveSequenceToConfig();
      } else {
        console.warn(
          "Steps reordered in store, but not auto-saved (no current sequence or active config)."
        );
      }
    },

    saveSequenceToConfig: async () => {
      const { currentSequence, activeConfigId } = get();
      if (!currentSequence || !activeConfigId) {
        set((state) => {
          state.error = "No active sequence or configuration to save.";
        });
        return;
      }
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });
      try {
        // TODO: IPC call to save the sequence to the config document
        // For example: await window.electron.ipcRenderer.invoke('save-sequence-to-config', activeConfigId, currentSequence);
        // console.log(
        //   `Simulating IPC call to save sequence ${currentSequence.id} to config ${activeConfigId}`
        // );
        // console.log("Sequence data to save:", currentSequence);

        const result = await window.ipc.invoke(
          "save-sequence-to-config",
          activeConfigId,
          currentSequence
        );

        if (!result || !result.success || !result.sequence) {
          throw new Error(
            result.message || "Failed to save sequence to the backend."
          );
        }

        // Simulate a successful save by just updating the timestamp (in a real scenario, backend would confirm)
        set((state) => {
          if (state.currentSequence) {
            // state.currentSequence.updatedAt = new Date().toISOString();
            // Update the current sequence with the one returned from the backend,
            // as it may have updated timestamps or other backend-enforced values.
            state.currentSequence = result.sequence;
          }
        });
        // Potentially, the backend might return the updated config/sequence, which we could then use to update the store.
      } catch (err: any) {
        set((state) => {
          state.error = err.message || "Failed to save sequence.";
        });
      } finally {
        set((state) => {
          state.isLoading = false;
        });
      }
    },

    clearError: () => {
      set((state) => {
        state.error = null;
      });
    },

    resetStore: () => {
      set(initialState);
    },
  }))
);

// Expose a way to access the store outside of React components if needed (e.g., for utility functions)
// export const getSequenceStoreState = useSequenceStore.getState;
