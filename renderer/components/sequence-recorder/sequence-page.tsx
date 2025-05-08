"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Clock } from "lucide-react";
import { SequenceTimeline } from "@/components/sequence-recorder/sequence-timeline";
import { SequenceControls } from "@/components/sequence-recorder/sequence-controls";
import { SequenceStepList } from "@/components/sequence-recorder/sequence-step-list";
import { SequenceDevicePanel } from "@/components/sequence-recorder/sequence-device-panel";
import { SequenceHeader } from "@/components/sequence-recorder/sequence-header";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useSequenceStore } from "@/store/sequenceStore";
import { useSequenceRunner } from "@/hooks/use-sequence-runner";

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

  // Use the sequence runner
  const sequenceRunner = useSequenceRunner();

  useEffect(() => {
    if (configId) {
      loadConfigAndInitializeSequence(
        configId,
        initialSequenceId !== "new-sequence" ? initialSequenceId : undefined
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
      !isLoading
    ) {
      if (availableDevices.length > 0) {
        createNewSequence("New Sequence", "Describe your sequence here");
      }
    }
  }, [
    configId,
    activeConfigId,
    initialSequenceId,
    currentSequence,
    isLoading,
    createNewSequence,
    availableDevices,
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
            onAddStep={() => {
              toast({
                title: "Add Step Clicked",
                description: "Implement Add Step Dialog.",
              });
            }}
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
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-grow overflow-hidden"
          >
            <TabsList className="shrink-0">
              <TabsTrigger value="timeline">
                <Clock className="w-4 h-4 mr-2" /> Timeline View
              </TabsTrigger>
              <TabsTrigger value="steps">
                <Plus className="w-4 h-4 mr-2" /> Step List
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="timeline"
              className="flex-grow overflow-y-auto p-1"
            >
              {currentSequence ? (
                <SequenceTimeline
                  steps={currentSequence.steps}
                  devices={availableDevices}
                  onStepSelect={(stepId) =>
                    console.log("Step selected:", stepId)
                  }
                />
              ) : (
                <p>No sequence loaded or steps available for timeline view.</p>
              )}
            </TabsContent>
            <TabsContent value="steps" className="flex-grow overflow-y-auto">
              {currentSequence ? (
                <SequenceStepList
                  steps={currentSequence.steps}
                  devices={availableDevices}
                  onDeleteStep={(stepId) =>
                    useSequenceStore.getState().deleteStep(stepId)
                  }
                  onReorderSteps={useSequenceStore.getState().reorderSteps}
                />
              ) : (
                <p>No sequence loaded or steps available for list view.</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
