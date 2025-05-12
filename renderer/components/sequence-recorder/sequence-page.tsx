"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SequenceTimeline } from "@/components/sequence-recorder/sequence-timeline";
import { SequenceControls } from "@/components/sequence-recorder/sequence-controls";
import { SequenceStepList } from "@/components/sequence-recorder/sequence-step-list";
import { SequenceDevicePanel } from "@/components/sequence-recorder/sequence-device-panel";
import { SequenceHeader } from "@/components/sequence-recorder/sequence-header";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useSequenceStore } from "@/store/sequenceStore";
import { useSequenceRunner } from "@/hooks/use-sequence-runner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SequenceStep,
  ActionStep,
  DelayStep,
  DeviceDisplay,
  HardwareConfig,
} from "../../../common/types";
import { ZapIcon, TimerIcon, Clock, Plus } from "lucide-react";
import { v4 as uuidv4 } from "uuid"; // Import uuidv4 for generating unique IDs

// Types
/*
export type DeviceType = "stepper" | "servo" | "io";

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  [key: string]: any; // Keep for flexibility from dashboard/device panel
}

export interface SequenceStep {
  id: string;
  timestamp: number; // Milliseconds from sequence start when this step begins
  deviceId: string;
  deviceName: string; // Keep for display
  deviceType: DeviceType;
  action: string; // The command sent to the device (e.g., "setAngle", "moveTo")
  value: any; // The value for the command (number, boolean, object, etc.)
  // Optional fields
  speed?: number;
  acceleration?: number;
}

export interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  createdAt: string;
  updatedAt: string;
}
*/

// Define SendMessage type if not already globally available
type SendMessage = (message: object) => void;

// Update props for SequencePage if needed, or get sendMessage from context/hook
// interface SequencePageProps { sendMessage: SendMessage; }

export default function SequencePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSequenceId = searchParams.get("id");
  const configId = searchParams.get("config");
  const initialNameFromUrl = searchParams.get("name");
  const { toast } = useToast();

  const {
    currentSequence,
    availableDevices,
    isLoading,
    error,
    activeConfigId,
    loadConfigAndInitializeSequence,
    resetStore,
    createNewSequence,
  } = useSequenceStore();

  // States for UI interactions not directly in sequence data (recording, playback)
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [activeTab, setActiveTab] = useState("timeline");
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [dialogStepData, setDialogStepData] = useState({
    stepType: "action" as "action" | "delay",
    deviceId: "",
    action: "",
    value: "" as string | number,
    speed: "" as string | number,
    acceleration: "" as string | number,
    duration: 1000,
    editingStepId: null as string | null,
  });

  // Use the sequence runner
  const sequenceRunner = useSequenceRunner();

  useEffect(() => {
    if (configId) {
      loadConfigAndInitializeSequence(
        configId,
        initialSequenceId !== "new-sequence"
          ? initialSequenceId
          : "new-sequence",
        initialNameFromUrl || undefined
      );
    } else {
      toast({
        title: "Error: Configuration ID Missing",
        description: "Cannot load sequence page without a configuration ID.",
        variant: "destructive",
      });
    }

    return () => {
      resetStore();
    };
  }, [
    configId,
    initialSequenceId,
    initialNameFromUrl,
    loadConfigAndInitializeSequence,
    resetStore,
    toast,
  ]);

  useEffect(() => {
    if (
      configId &&
      activeConfigId === configId &&
      initialSequenceId === "new-sequence" &&
      !currentSequence &&
      !isLoading &&
      !initialNameFromUrl
    ) {
      if (availableDevices.length > 0) {
        console.log(
          "Secondary useEffect: 'new-sequence' without initialName, store should have created one."
        );
      }
    }
  }, [
    configId,
    activeConfigId,
    initialSequenceId,
    currentSequence,
    isLoading,
    availableDevices,
    initialNameFromUrl,
  ]);

  const sendMessage: SendMessage = (message) => {
    console.log("SIMULATED SEND MESSAGE:", JSON.stringify(message));
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      toast({
        title: "Recording stopped",
      });
    } else {
      setIsRecording(true);
      toast({
        title: "Recording started",
        description: "Perform actions on devices to record them",
      });
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentSequence && currentSequence.steps.length > 0) {
        setIsPlaying(true);
      } else {
        toast({
          title: "Cannot Play",
          description: "Sequence has no steps to play.",
          variant: "destructive",
        });
      }
    }
  };

  const handleGoBack = () => {
    if (configId) {
      router.push(`/sequences?config=${configId}`); // Navigate back to sequences list instead of dashboard
    } else {
      router.push("/configurations"); // Fallback if no configId
    }
  };

  // Function to run the current sequence
  const runCurrentSequence = async () => {
    if (!currentSequence) {
      toast({
        title: "No Sequence",
        description: "There is no sequence to run.",
        variant: "destructive",
      });
      return;
    }

    if (currentSequence.steps.length === 0) {
      toast({
        title: "Empty Sequence",
        description: "This sequence has no steps to run.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Check connection status first
      const connectionStatus = await window.ipc.invoke("get-connection-status");

      if (!connectionStatus.connected) {
        toast({
          title: "Not Connected",
          description: "Please connect to a device before running sequences.",
          variant: "destructive",
        });
        return;
      }

      // Run the sequence
      await sequenceRunner.runSequence(currentSequence, 0, playbackSpeed);
    } catch (error) {
      console.error("Error running sequence:", error);
      toast({
        title: "Run Error",
        description:
          error.message || "An error occurred while running the sequence.",
        variant: "destructive",
      });
    }
  };

  // Add functions for handling step editing and reordering
  const handleOpenAddStepDialog = () => {
    setDialogStepData({
      stepType: "action",
      deviceId: "",
      action: "",
      value: "",
      speed: "",
      acceleration: "",
      duration: 1000,
      editingStepId: null,
    });
    setIsStepDialogOpen(true);
  };

  const handleAddDelayDirectly = (atIndex?: number) => {
    if (!currentSequence) return;

    const delayStepPayload: DelayStep = {
      id: uuidv4(),
      type: "delay",
      duration: 1000, // Default duration of 1 second
    };

    if (
      typeof atIndex === "number" &&
      atIndex <= currentSequence.steps.length
    ) {
      // Create a new array with the delay inserted at the specified index
      const newSteps = [...currentSequence.steps];
      newSteps.splice(atIndex, 0, delayStepPayload);

      // Update the sequence with the reordered steps
      useSequenceStore.getState().reorderSteps(newSteps);
    } else {
      // Just add to the end if no index specified
      useSequenceStore.getState().addStep({
        duration: delayStepPayload.duration,
      });
    }

    toast({
      title: "Delay Added",
      description: "Added a 1 second delay. Click on it to edit duration.",
    });
  };

  const handleOpenEditStepDialog = (stepToEdit: SequenceStep) => {
    if (stepToEdit.type === "action") {
      setDialogStepData({
        stepType: "action",
        deviceId: stepToEdit.deviceId,
        action: stepToEdit.action,
        value: String(stepToEdit.value),
        speed: stepToEdit.speed !== undefined ? String(stepToEdit.speed) : "",
        acceleration:
          stepToEdit.acceleration !== undefined
            ? String(stepToEdit.acceleration)
            : "",
        duration: 1000,
        editingStepId: stepToEdit.id,
      });
    } else {
      setDialogStepData({
        stepType: "delay",
        deviceId: "",
        action: "",
        value: "",
        speed: "",
        acceleration: "",
        duration: stepToEdit.duration,
        editingStepId: stepToEdit.id,
      });
    }
    setIsStepDialogOpen(true);
  };

  const handleDialogInputChange = (
    field: keyof typeof dialogStepData,
    value: any
  ) => {
    setDialogStepData((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "deviceId" && {
        action: "",
        value: "",
        speed: "",
        acceleration: "",
      }),
      ...(field === "stepType" && {
        action: "",
        value: "",
        speed: "",
        acceleration: "",
        deviceId: "",
      }),
      ...(field === "action" && { value: "", speed: "", acceleration: "" }),
    }));
  };

  const getDeviceDetails = (deviceId: string): DeviceDisplay | undefined => {
    return availableDevices.find((d) => d.id === deviceId);
  };

  const getAvailableActions = (
    deviceId: string
  ): { value: string; label: string }[] => {
    const device = getDeviceDetails(deviceId);
    if (!device) return [];

    switch (device.componentGroup) {
      case "steppers":
        return [
          { value: "moveTo", label: "Move To Position" },
          { value: "setSpeed", label: "Set Max Speed" },
          { value: "setAcceleration", label: "Set Acceleration" },
        ];
      case "servos":
        return [{ value: "setAngle", label: "Set Angle" }];
      case "pins":
      case "relays":
        return [{ value: "setValue", label: "Set Value (0 or 1)" }];
      default:
        return [{ value: "customAction", label: "Custom Action" }];
    }
  };

  const handleSaveStepDialog = () => {
    if (dialogStepData.stepType === "action") {
      if (!dialogStepData.deviceId || !dialogStepData.action) {
        toast({
          title: "Validation Error",
          description: "Device and Action are required for an action step.",
          variant: "destructive",
        });
        return;
      }
      const device = getDeviceDetails(dialogStepData.deviceId);
      if (!device) {
        toast({
          title: "Error",
          description: "Selected device not found.",
          variant: "destructive",
        });
        return;
      }

      let parsedValue: number | boolean | string = 0;
      const valueString = String(dialogStepData.value);
      if (dialogStepData.action === "setValue") {
        parsedValue = parseInt(valueString) === 1 ? 1 : 0;
      } else {
        parsedValue = parseFloat(valueString);
        if (isNaN(parsedValue)) {
          toast({
            title: "Validation Error",
            description: "Invalid numeric value for action.",
            variant: "destructive",
          });
          return;
        }
      }

      const actionStepPayload: Omit<ActionStep, "id" | "type"> = {
        deviceId: dialogStepData.deviceId,
        deviceComponentGroup: device.componentGroup as keyof HardwareConfig,
        action: dialogStepData.action,
        value: parsedValue,
        ...(dialogStepData.speed &&
          !isNaN(parseFloat(String(dialogStepData.speed))) && {
            speed: parseFloat(String(dialogStepData.speed)),
          }),
        ...(dialogStepData.acceleration &&
          !isNaN(parseFloat(String(dialogStepData.acceleration))) && {
            acceleration: parseFloat(String(dialogStepData.acceleration)),
          }),
      };

      if (dialogStepData.editingStepId) {
        useSequenceStore.getState().updateStep(dialogStepData.editingStepId, {
          type: "action",
          ...actionStepPayload,
        });
      } else {
        useSequenceStore.getState().addStep(actionStepPayload);
      }
    } else {
      const durationValue = Number(dialogStepData.duration);
      if (isNaN(durationValue) || durationValue <= 0) {
        toast({
          title: "Validation Error",
          description: "Invalid duration for delay step.",
          variant: "destructive",
        });
        return;
      }
      const delayStepPayload: Omit<DelayStep, "id" | "type"> = {
        duration: durationValue,
      };
      if (dialogStepData.editingStepId) {
        useSequenceStore.getState().updateStep(dialogStepData.editingStepId, {
          type: "delay",
          ...delayStepPayload,
        });
      } else {
        useSequenceStore.getState().addStep(delayStepPayload);
      }
    }
    setIsStepDialogOpen(false);
  };

  const handleMoveStepUp = (stepId: string) => {
    if (!currentSequence) return;

    const stepIndex = currentSequence.steps.findIndex(
      (step) => step.id === stepId
    );
    if (stepIndex <= 0) return;

    const newSteps = [...currentSequence.steps];
    const temp = newSteps[stepIndex];
    newSteps[stepIndex] = newSteps[stepIndex - 1];
    newSteps[stepIndex - 1] = temp;

    useSequenceStore.getState().reorderSteps(newSteps);

    toast({
      title: "Step Moved",
      description: "Step moved up in sequence",
    });
  };

  const handleMoveStepDown = (stepId: string) => {
    if (!currentSequence) return;

    const stepIndex = currentSequence.steps.findIndex(
      (step) => step.id === stepId
    );
    if (stepIndex < 0 || stepIndex >= currentSequence.steps.length - 1) return;

    const newSteps = [...currentSequence.steps];
    const temp = newSteps[stepIndex];
    newSteps[stepIndex] = newSteps[stepIndex + 1];
    newSteps[stepIndex + 1] = temp;

    useSequenceStore.getState().reorderSteps(newSteps);

    toast({
      title: "Step Moved",
      description: "Step moved down in sequence",
    });
  };

  if (isLoading && !currentSequence) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading sequence editor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-500">
        <p>Error loading sequence data: {error}</p>
        <button
          onClick={() =>
            configId &&
            loadConfigAndInitializeSequence(
              configId,
              initialSequenceId !== "new-sequence"
                ? initialSequenceId
                : undefined
            )
          }
          className="mt-4 p-2 bg-blue-500 text-white rounded"
        >
          Retry Load
        </button>
      </div>
    );
  }

  if (!configId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-500">
        <p>Configuration ID is missing. Please select a configuration first.</p>
      </div>
    );
  }

  if (
    activeConfigId === configId &&
    !currentSequence &&
    !isLoading &&
    initialSequenceId !== "new-sequence"
  ) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p>Sequence not found or not yet created for this configuration.</p>
        <button
          onClick={() =>
            createNewSequence("New Sequence", "Describe your sequence here")
          }
          className="mt-4 p-2 bg-green-500 text-white rounded"
          disabled={availableDevices.length === 0}
        >
          Create New Sequence
        </button>
        {availableDevices.length === 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Waiting for device information to be loaded...
          </p>
        )}
      </div>
    );
  }

  if (!currentSequence && activeTab !== "devices") {
    if (isLoading)
      return (
        <div className="flex items-center justify-center h-screen">
          <p>Initializing sequence...</p>
        </div>
      );
  }

  return (
    <div className="flex flex-col h-screen p-4 md:p-6 lg:p-8 bg-background text-foreground">
      <Toaster />
      {currentSequence && (
        <SequenceHeader
          sequenceName={currentSequence.name}
          sequenceDescription={currentSequence.description || ""}
          onNameChange={(name) =>
            useSequenceStore.getState().updateSequenceDetails({ name })
          }
          onDescriptionChange={(description) =>
            useSequenceStore.getState().updateSequenceDetails({ description })
          }
          onBack={handleGoBack}
        />
      )}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 overflow-hidden">
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
          <SequenceControls
            onSave={useSequenceStore.getState().saveSequenceToConfig}
            isSaving={isLoading}
            canSave={!!currentSequence && !!activeConfigId}
            onAddStep={handleOpenAddStepDialog}
            isRecording={isRecording}
            onToggleRecording={toggleRecording}
            isPlaying={sequenceRunner.isRunning}
            onTogglePlayback={() =>
              sequenceRunner.isRunning
                ? sequenceRunner.isPaused
                  ? sequenceRunner.resumeSequence()
                  : sequenceRunner.pauseSequence()
                : runCurrentSequence()
            }
            onStopPlayback={() => sequenceRunner.stopSequence()}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={(speed) => {
              setPlaybackSpeed(speed);
              if (sequenceRunner.isRunning) {
                sequenceRunner.setPlaybackSpeed(speed);
              }
            }}
            hasSteps={currentSequence?.steps?.length > 0}
          />

          {/* Show sequence run status if a sequence is running */}
          {sequenceRunner.isRunning && (
            <div className="bg-card rounded-lg border p-4">
              <div className="text-sm font-medium mb-2">
                Running: Step {sequenceRunner.currentStepIndex + 1} of{" "}
                {sequenceRunner.totalSteps}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-in-out"
                  style={{
                    width: `${
                      (sequenceRunner.currentStepIndex /
                        Math.max(1, sequenceRunner.totalSteps)) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 flex flex-col overflow-hidden">
          <div className="flex flex-col flex-grow overflow-hidden bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center">
                <Clock className="w-4 h-4 mr-2" /> Timeline
              </h3>
            </div>
            <div className="flex-grow overflow-y-auto">
              {currentSequence ? (
                <SequenceTimeline
                  steps={currentSequence.steps}
                  devices={availableDevices}
                  onDeleteStep={(stepId) =>
                    useSequenceStore.getState().deleteStep(stepId)
                  }
                  onEditStep={handleOpenEditStepDialog}
                  onMoveStepUp={handleMoveStepUp}
                  onMoveStepDown={handleMoveStepDown}
                  onAddStep={handleOpenAddStepDialog}
                  onAddDelay={handleAddDelayDirectly}
                />
              ) : (
                <p>No sequence loaded or steps available for timeline view.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Step Edit Dialog */}
      <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
        <DialogContent className="sm:max-w-xl md:max-w-2xl bg-card/80 dark:bg-card/80 backdrop-blur-md border rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {dialogStepData.editingStepId ? "Edit Step" : "Add New Step"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {dialogStepData.editingStepId
                ? "Modify the details of this step."
                : "Choose a device action or a delay to add to your sequence."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div>
              <Label className="mb-3 block font-medium text-muted-foreground">
                1. Choose Step Type
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={
                    dialogStepData.stepType === "action"
                      ? "secondary"
                      : "outline"
                  }
                  onClick={() => handleDialogInputChange("stepType", "action")}
                  disabled={!!dialogStepData.editingStepId}
                  className="justify-center items-center p-4 h-auto rounded-md"
                >
                  <ZapIcon className="mr-3 h-5 w-5" />
                  <div className="text-center">
                    <p className="font-semibold">Device Action</p>
                    <p className="text-xs text-muted-foreground">
                      Control a motor, pin, etc.
                    </p>
                  </div>
                </Button>
                <Button
                  variant={
                    dialogStepData.stepType === "delay"
                      ? "secondary"
                      : "outline"
                  }
                  onClick={() => handleDialogInputChange("stepType", "delay")}
                  disabled={!!dialogStepData.editingStepId}
                  className="justify-center items-center p-4 h-auto rounded-md"
                >
                  <TimerIcon className="mr-3 h-5 w-5" />
                  <div className="text-center">
                    <p className="font-semibold">Delay</p>
                    <p className="text-xs text-muted-foreground">
                      Wait for a duration
                    </p>
                  </div>
                </Button>
              </div>
            </div>

            {dialogStepData.stepType === "action" && (
              <div className="space-y-4 border-t border-border pt-4 mt-4">
                <div>
                  <Label className="mb-3 block font-medium text-muted-foreground">
                    2. Choose Device
                  </Label>
                  {availableDevices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      (No devices found in configuration)
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {availableDevices.map((device) => (
                        <Button
                          key={device.id}
                          variant={
                            dialogStepData.deviceId === device.id
                              ? "secondary"
                              : "outline"
                          }
                          onClick={() =>
                            handleDialogInputChange("deviceId", device.id)
                          }
                          className="text-xs justify-center h-auto p-2 rounded-md"
                        >
                          {device.name} ({device.componentGroup})
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {dialogStepData.deviceId && (
                  <div className="mt-4">
                    <Label className="mb-3 block font-medium text-muted-foreground">
                      3. Choose Action
                    </Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {getAvailableActions(dialogStepData.deviceId).map(
                        (act) => (
                          <Button
                            key={act.value}
                            variant={
                              dialogStepData.action === act.value
                                ? "secondary"
                                : "outline"
                            }
                            onClick={() =>
                              handleDialogInputChange("action", act.value)
                            }
                            className="text-xs justify-center h-auto p-2 rounded-md"
                          >
                            {act.label}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {dialogStepData.action && (
                  <div className="space-y-4 border-t border-border pt-4 mt-6">
                    <Label className="block font-medium text-muted-foreground">
                      4. Configure Action Parameters
                    </Label>
                    <div className="grid gap-2">
                      <Label htmlFor="value" className="text-muted-foreground">
                        {dialogStepData.action === "setSpeed"
                          ? "Target Speed"
                          : dialogStepData.action === "setAcceleration"
                          ? "Target Acceleration"
                          : dialogStepData.action === "setAngle"
                          ? "Target Angle"
                          : dialogStepData.action === "moveTo"
                          ? "Target Position"
                          : dialogStepData.action === "setValue"
                          ? "Value (0 or 1)"
                          : "Value"}
                      </Label>
                      <Input
                        id="value"
                        type="text"
                        inputMode={
                          dialogStepData.action === "setValue"
                            ? "numeric"
                            : "decimal"
                        }
                        value={dialogStepData.value}
                        onChange={(e) =>
                          handleDialogInputChange("value", e.target.value)
                        }
                        placeholder={
                          dialogStepData.action === "setSpeed"
                            ? "steps/sec"
                            : dialogStepData.action === "setAcceleration"
                            ? "steps/sec²"
                            : dialogStepData.action === "setAngle"
                            ? "degrees"
                            : dialogStepData.action === "moveTo"
                            ? "steps"
                            : dialogStepData.action === "setValue"
                            ? "0 or 1"
                            : "Enter value"
                        }
                        className="bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                      />
                    </div>

                    {(dialogStepData.action === "moveTo" ||
                      dialogStepData.action === "setAngle") && (
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border mt-3">
                        <div className="grid gap-2">
                          <Label
                            htmlFor="speed"
                            className="text-muted-foreground"
                          >
                            Override Speed (Optional)
                          </Label>
                          <Input
                            id="speed"
                            type="text"
                            inputMode="decimal"
                            value={dialogStepData.speed}
                            onChange={(e) =>
                              handleDialogInputChange("speed", e.target.value)
                            }
                            placeholder="e.g., 500 steps/sec"
                            className="bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label
                            htmlFor="acceleration"
                            className="text-muted-foreground"
                          >
                            Override Accel (Optional)
                          </Label>
                          <Input
                            id="acceleration"
                            type="text"
                            inputMode="decimal"
                            value={dialogStepData.acceleration}
                            onChange={(e) =>
                              handleDialogInputChange(
                                "acceleration",
                                e.target.value
                              )
                            }
                            placeholder="e.g., 200 steps/sec²"
                            className="bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {dialogStepData.stepType === "delay" && (
              <div className="grid gap-2 border-t border-border pt-4 mt-4">
                <Label className="mb-3 block font-medium text-muted-foreground">
                  2. Configure Delay
                </Label>
                <Label htmlFor="duration" className="text-muted-foreground">
                  Duration (ms)
                </Label>
                <Input
                  id="duration"
                  type="text"
                  inputMode="numeric"
                  min="1"
                  value={dialogStepData.duration}
                  onChange={(e) =>
                    handleDialogInputChange(
                      "duration",
                      Math.max(
                        1,
                        Number(e.target.value) ||
                          Number(dialogStepData.duration) ||
                          1
                      )
                    )
                  }
                  className="bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-lg">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSaveStepDialog}
              variant="default"
              className="rounded-lg"
            >
              Save Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
