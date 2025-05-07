"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Clock, Settings } from "lucide-react";
import { SequenceTimeline } from "@/components/sequence-recorder/sequence-timeline";
import { SequenceControls } from "@/components/sequence-recorder/sequence-controls";
import { SequenceStepList } from "@/components/sequence-recorder/sequence-step-list";
import { SequenceDevicePanel } from "@/components/sequence-recorder/sequence-device-panel";
import { SequenceHeader } from "@/components/sequence-recorder/sequence-header";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

// Types
export type DeviceType = "stepper" | "servo" | "io";

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  [key: string]: any;
}

export interface SequenceStep {
  id: string;
  deviceId: string;
  deviceType: DeviceType;
  deviceName: string;
  action: string;
  value: number;
  duration: number;
  timestamp: number;
}

export interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  createdAt: string;
  updatedAt: string;
}

export default function SequencePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sequenceId = searchParams.get("id");
  const configId = searchParams.get("config");
  const { toast } = useToast();

  // States
  const [sequence, setSequence] = useState<Sequence>({
    id: sequenceId || "new-sequence",
    name: "New Sequence",
    description: "Describe your sequence here",
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const [devices, setDevices] = useState<Device[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [recordStartTime, setRecordStartTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("timeline");

  // Mock devices for demonstration
  useEffect(() => {
    // In a real app, this would fetch devices from the API
    setDevices([
      {
        id: "stepper-1",
        name: "X-Axis Stepper",
        type: "stepper",
        position: 0,
        speed: 1000,
        acceleration: 500,
        stepsPerInch: 200,
        minPosition: -50000,
        maxPosition: 50000,
        pins: { step: 2, direction: 3, enable: 4 },
      },
      {
        id: "stepper-2",
        name: "Y-Axis Stepper",
        type: "stepper",
        position: 0,
        speed: 1000,
        acceleration: 500,
        stepsPerInch: 200,
        minPosition: -50000,
        maxPosition: 50000,
        pins: { step: 5, direction: 6, enable: 7 },
      },
      {
        id: "servo-1",
        name: "Gripper Servo",
        type: "servo",
        angle: 90,
        minAngle: 0,
        maxAngle: 180,
        pins: { control: 9 },
      },
      {
        id: "io-1",
        name: "Pump Control",
        type: "io",
        pinNumber: 12,
        mode: "output",
        pinType: "digital",
        value: 0,
      },
    ]);
  }, []);

  // Load sequence if editing an existing one
  useEffect(() => {
    if (sequenceId && sequenceId !== "new-sequence") {
      // In a real app, this would fetch the sequence from the API
      // For now, we'll use mock data
      const mockSequence: Sequence = {
        id: sequenceId,
        name: "Sample Movement Sequence",
        description: "A demonstration sequence that moves motors in a pattern",
        steps: [
          {
            id: "step-1",
            deviceId: "stepper-1",
            deviceType: "stepper",
            deviceName: "X-Axis Stepper",
            action: "moveTo",
            value: 10000,
            duration: 2000,
            timestamp: 0,
          },
          {
            id: "step-2",
            deviceId: "stepper-2",
            deviceType: "stepper",
            deviceName: "Y-Axis Stepper",
            action: "moveTo",
            value: 5000,
            duration: 1500,
            timestamp: 2000,
          },
          {
            id: "step-3",
            deviceId: "servo-1",
            deviceType: "servo",
            deviceName: "Gripper Servo",
            action: "setAngle",
            value: 45,
            duration: 1000,
            timestamp: 3500,
          },
          {
            id: "step-4",
            deviceId: "io-1",
            deviceType: "io",
            deviceName: "Pump Control",
            action: "setValue",
            value: 1,
            duration: 0,
            timestamp: 4500,
          },
          {
            id: "step-5",
            deviceId: "stepper-1",
            deviceType: "stepper",
            deviceName: "X-Axis Stepper",
            action: "moveTo",
            value: 0,
            duration: 2000,
            timestamp: 6000,
          },
          {
            id: "step-6",
            deviceId: "stepper-2",
            deviceType: "stepper",
            deviceName: "Y-Axis Stepper",
            action: "moveTo",
            value: 0,
            duration: 1500,
            timestamp: 8000,
          },
          {
            id: "step-7",
            deviceId: "servo-1",
            deviceType: "servo",
            deviceName: "Gripper Servo",
            action: "setAngle",
            value: 90,
            duration: 1000,
            timestamp: 9500,
          },
          {
            id: "step-8",
            deviceId: "io-1",
            deviceType: "io",
            deviceName: "Pump Control",
            action: "setValue",
            value: 0,
            duration: 0,
            timestamp: 10500,
          },
        ],
        createdAt: "2023-08-15T10:30:00Z",
        updatedAt: "2023-08-16T14:45:00Z",
      };
      setSequence(mockSequence);
    }
  }, [sequenceId]);

  // Handle recording state
  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      setRecordStartTime(null);
      toast({
        title: "Recording stopped",
        description: `Recorded ${sequence.steps.length} steps`,
      });
    } else {
      // Start recording
      setIsRecording(true);
      setRecordStartTime(Date.now());
      toast({
        title: "Recording started",
        description: "Perform actions on devices to record them",
      });
    }
  };

  // Handle playback
  const togglePlayback = () => {
    if (isPlaying) {
      // Pause playback
      setIsPlaying(false);
    } else {
      // Start playback
      if (sequence.steps.length === 0) {
        toast({
          title: "No steps to play",
          description: "Record some steps first",
          variant: "destructive",
        });
        return;
      }
      setIsPlaying(true);
      setCurrentStepIndex(0);
    }
  };

  // Stop playback
  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentStepIndex(-1);
  };

  // Record a new step
  const recordStep = (
    deviceId: string,
    action: string,
    value: number,
    duration = 0
  ) => {
    if (!isRecording || !recordStartTime) return;

    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    const timestamp = Date.now() - recordStartTime;

    const newStep: SequenceStep = {
      id: `step-${Date.now()}`,
      deviceId,
      deviceType: device.type,
      deviceName: device.name,
      action,
      value,
      duration,
      timestamp,
    };

    setSequence((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
      updatedAt: new Date().toISOString(),
    }));
  };

  // Update sequence metadata
  const updateSequence = (data: Partial<Sequence>) => {
    setSequence((prev) => ({
      ...prev,
      ...data,
      updatedAt: new Date().toISOString(),
    }));
  };

  // Save sequence
  const saveSequence = () => {
    // In a real app, this would save to the API
    toast({
      title: "Sequence saved",
      description: `"${sequence.name}" has been saved successfully`,
    });
  };

  // Update a step
  const updateStep = (stepId: string, data: Partial<SequenceStep>) => {
    setSequence((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === stepId ? { ...step, ...data } : step
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  // Delete a step
  const deleteStep = (stepId: string) => {
    setSequence((prev) => ({
      ...prev,
      steps: prev.steps.filter((step) => step.id !== stepId),
      updatedAt: new Date().toISOString(),
    }));
  };

  // Reorder steps
  const reorderSteps = (steps: SequenceStep[]) => {
    setSequence((prev) => ({
      ...prev,
      steps,
      updatedAt: new Date().toISOString(),
    }));
  };

  // Add a step manually
  const addStep = (step: Omit<SequenceStep, "id" | "timestamp">) => {
    const lastStep = sequence.steps[sequence.steps.length - 1];
    const timestamp = lastStep
      ? lastStep.timestamp + lastStep.duration + 500
      : 0;

    const newStep: SequenceStep = {
      id: `step-${Date.now()}`,
      ...step,
      timestamp,
    };

    setSequence((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
      updatedAt: new Date().toISOString(),
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="container mx-auto p-4 md:p-6">
        {/* Header with back button, title, and save button */}
        <SequenceHeader
          sequence={sequence}
          updateSequence={updateSequence}
          onSave={saveSequence}
          onBack={() => router.push(`/dashboard?config=${configId}`)}
        />

        {/* Main content */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel - Devices */}
          <div className="lg:col-span-1">
            <div className="backdrop-blur-md bg-white/70 dark:bg-gray-800/50 rounded-xl border border-white/20 dark:border-gray-700/30 shadow-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Settings className="h-5 w-5 mr-2 text-gray-500 dark:text-gray-400" />
                Devices
              </h2>
              <SequenceDevicePanel
                devices={devices}
                isRecording={isRecording}
                onRecordStep={recordStep}
                currentStep={
                  currentStepIndex >= 0
                    ? sequence.steps[currentStepIndex]
                    : null
                }
                isPlaying={isPlaying}
              />
            </div>
          </div>

          {/* Right panel - Sequence editor and controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Playback controls */}
            <SequenceControls
              isRecording={isRecording}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              onToggleRecording={toggleRecording}
              onTogglePlayback={togglePlayback}
              onStopPlayback={stopPlayback}
              onChangeSpeed={setPlaybackSpeed}
              sequenceLength={
                sequence.steps.length > 0
                  ? sequence.steps[sequence.steps.length - 1].timestamp + 1000
                  : 0
              }
              currentTime={
                currentStepIndex >= 0
                  ? sequence.steps[currentStepIndex].timestamp
                  : 0
              }
            />

            {/* Sequence editor tabs */}
            <div className="backdrop-blur-md bg-white/70 dark:bg-gray-800/50 rounded-xl border border-white/20 dark:border-gray-700/30 shadow-lg">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <div className="px-4 pt-4">
                  <TabsList className="grid grid-cols-2 mb-2">
                    <TabsTrigger value="timeline" className="text-sm">
                      <Clock className="h-4 w-4 mr-2" />
                      Timeline
                    </TabsTrigger>
                    <TabsTrigger value="steps" className="text-sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Steps
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="timeline" className="p-4 pt-2">
                  <SequenceTimeline
                    steps={sequence.steps}
                    currentStepIndex={currentStepIndex}
                    onUpdateStep={updateStep}
                    onDeleteStep={deleteStep}
                    onReorderSteps={reorderSteps}
                  />
                </TabsContent>

                <TabsContent value="steps" className="p-4 pt-2">
                  <SequenceStepList
                    steps={sequence.steps}
                    devices={devices}
                    onUpdateStep={updateStep}
                    onDeleteStep={deleteStep}
                    onAddStep={addStep}
                    currentStepIndex={currentStepIndex}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
