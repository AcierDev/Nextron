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
    sequenceId?: string
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

    loadConfigAndInitializeSequence: async (configId, sequenceId) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
        state.activeConfigId = configId;
        // Reset previous sequence and devices if any
        state.currentSequence = null;
        state.availableDevices = [];
      });
      try {
        // TODO: Replace with actual IPC call to fetch config
        // const configData: FullConfigDataIPC = await window.electron.ipcRenderer.invoke('get-config-by-id', configId);
        // console.log(`Simulating IPC call to get-config-by-id for ${configId}`);
        // Mock config data for now, assuming it's fetched via IPC
        // const mockConfigData: FullConfigDataIPC = {
        //   _id: configId,
        //   name: "Mock Config",
        //   hardware: {
        //     servos: [
        //       {
        //         id: "servo1",
        //         name: "Gripper",
        //         type: "Servo",
        //         pins: [9],
        //         minAngle: 0,
        //         maxAngle: 180,
        //       },
        //     ],
        //     steppers: [
        //       {
        //         id: "stepper1",
        //         name: "X-Axis",
        //         type: "Stepper",
        //         pins: [2, 3],
        //         maxSpeed: 1000,
        //         acceleration: 500,
        //       },
        //     ],
        //     pins: [
        //       { id: "pin1", name: "LED", type: "Digital Output", pins: [13] },
        //     ],
        //     sensors: [],
        //     relays: [],
        //   },
        //   sequences:
        //     sequenceId === "seq1"
        //       ? [
        //           {
        //             id: "seq1",
        //             name: "Test Sequence 1",
        //             description: "A test sequence for mock config",
        //             steps: [
        //               {
        //                 type: "action",
        //                 id: uuidv4(),
        //                 deviceId: "servo1",
        //                 deviceComponentGroup: "servos",
        //                 action: "setAngle",
        //                 value: 90,
        //               },
        //               { type: "delay", id: uuidv4(), duration: 1000 },
        //               {
        //                 type: "action",
        //                 id: uuidv4(),
        //                 deviceId: "stepper1",
        //                 deviceComponentGroup: "steppers",
        //                 action: "moveTo",
        //                 value: 1000,
        //               },
        //             ],
        //             createdAt: new Date().toISOString(),
        //             updatedAt: new Date().toISOString(),
        //           },
        //         ]
        //       : [],
        //   createdAt: new Date().toISOString(),
        //   updatedAt: new Date().toISOString(),
        // };

        const fetchedConfigData: FullConfigDataIPC = await window.ipc.invoke(
          "get-config-by-id",
          configId
        );

        if (!fetchedConfigData) {
          throw new Error("Configuration not found.");
        }

        // Ensure sequences is an array, even if undefined in fetched data (though our type expects it)
        const configData = {
          ...fetchedConfigData,
          sequences: fetchedConfigData.sequences || [],
        };

        get()._setDevicesFromHardwareConfig(configData.hardware);

        let sequenceToLoad: Sequence | null = null;
        if (sequenceId && configData.sequences) {
          sequenceToLoad =
            configData.sequences.find((seq) => seq.id === sequenceId) || null;
        }

        if (sequenceToLoad) {
          set((state) => {
            state.currentSequence = sequenceToLoad;
          });
        } else if (sequenceId) {
          // If a sequenceId was provided but not found, it's an error or we could offer to create one
          console.warn(
            `Sequence with id ${sequenceId} not found in config ${configId}.`
          );
          // For now, we'll just start fresh, but a real app might clear sequenceId or show an error
          // Or, if 'new-sequence' is a convention, handle that explicitly to create a new one.
          get().createNewSequence("New Sequence from ID"); // Auto-create if ID was given but not found
        } else {
          // If no sequenceId, or if creating a new sequence explicitly
          // get().createNewSequence("New Sequence"); // Don't create one by default, let user action do it
          set((state) => {
            state.currentSequence = null;
          }); // Start with no sequence selected
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
      set((state) => {
        if (state.currentSequence) {
          state.currentSequence = {
            ...state.currentSequence,
            ...details,
            updatedAt: new Date().toISOString(),
          };
        }
      });
    },

    addStep: (
      stepData: Omit<ActionStep, "id" | "type"> | Omit<DelayStep, "id" | "type">
    ) => {
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
    },

    updateStep: (stepId, updatedData) => {
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
    },

    deleteStep: (stepId) => {
      set((state) => {
        if (state.currentSequence) {
          state.currentSequence.steps = state.currentSequence.steps.filter(
            (s) => s.id !== stepId
          );
          state.currentSequence.updatedAt = new Date().toISOString();
        }
      });
    },

    reorderSteps: (steps) => {
      set((state) => {
        if (state.currentSequence) {
          state.currentSequence.steps = steps;
          state.currentSequence.updatedAt = new Date().toISOString();
        }
      });
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
