"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DeviceDisplay,
  ActionStep,
  DelayStep,
  HardwareConfig, // Needed for deviceComponentGroup
} from "../../../common/types"; // Use types from common

// Removed local type imports from sequence-page

// Define SendMessage type locally if not global
type SendMessage = (message: object) => void; // Keep for direct device control if used

interface SequenceDevicePanelProps {
  devices: DeviceDisplay[];
  isRecording: boolean; // Keep for UI cues if needed, though direct recording is replaced
  // onRecordStep is replaced by onAddStep
  onAddStep: (
    stepData: Omit<ActionStep, "id" | "type"> | Omit<DelayStep, "id" | "type">
  ) => void;
  // currentStep: SequenceStep | null; // Removed for now, simplify focus to adding steps
  isPlaying?: boolean; // Optional: Keep if it disables controls
  sendMessage?: SendMessage; // Optional: Keep for direct device control
}

export function SequenceDevicePanel({
  devices,
  isRecording,
  onAddStep,
  isPlaying,
  sendMessage,
}: SequenceDevicePanelProps) {
  const [activeTab, setActiveTab] = useState("all");
  // deviceStates now uses ConfiguredComponent properties directly if available through DeviceDisplay
  const [deviceStates, setDeviceStates] = useState<
    Record<
      string,
      Partial<
        DeviceDisplay & { position?: number; angle?: number; value?: any }
      >
    >
  >({});

  useEffect(() => {
    // Initialize deviceStates from passed devices if needed, or ensure defaults are handled in getDeviceState
    const initialStates = {};
    devices.forEach((device) => {
      initialStates[device.id] = {
        position: (device as any).position || 0, // Assuming steppers might have this
        angle: (device as any).angle || 0, // Assuming servos might have this
        value: (device as any).value || 0, // Assuming IO pins might have this
      };
    });
    setDeviceStates(initialStates);
  }, [devices]);

  const filteredDevices =
    activeTab === "all"
      ? devices
      : devices.filter(
          (device) =>
            device.componentGroup === activeTab ||
            (activeTab === "io" && device.componentGroup === "pins")
        ); // Adjust for 'pins' being IO

  const handleDeviceChange = (
    deviceId: string,
    action: string,
    value: any,
    speed?: number,
    acceleration?: number
  ) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    // Update local UI state for immediate feedback
    let propertyToUpdateLocally: keyof (DeviceDisplay & {
      position?: number;
      angle?: number;
      value?: any;
    }) = "name"; // Default, will be overwritten
    if (action === "moveTo" || action === "step")
      propertyToUpdateLocally = "position";
    else if (action === "setAngle") propertyToUpdateLocally = "angle";
    else if (action === "setValue") propertyToUpdateLocally = "value";

    if (propertyToUpdateLocally !== "name") {
      // Ensure it was a recognized action for local state
      setDeviceStates((prev) => ({
        ...prev,
        [deviceId]: {
          ...prev[deviceId],
          [propertyToUpdateLocally]: value,
        },
      }));
    }

    // If isRecording is true (or some other condition indicates adding a step via UI interaction):
    // We will call onAddStep. The original `isRecording` flag might be repurposed or a new mechanism used.
    // For now, let's assume any control interaction that *could* be a step calls onAddStep.
    const stepData: Omit<ActionStep, "id" | "type"> = {
      deviceId: device.id,
      deviceComponentGroup: device.componentGroup as keyof HardwareConfig, // Cast as it comes from DeviceDisplay
      action: action,
      value: value,
      ...(speed !== undefined && { speed }),
      ...(acceleration !== undefined && { acceleration }),
    };
    onAddStep(stepData); // Call this to add the step to the store

    // Send message for direct device control (if sendMessage is provided)
    if (sendMessage) {
      let messagePayload: any = {
        action: "control",
        componentGroup:
          device.componentGroup +
          (device.componentGroup.endsWith("s") ? "" : "s"), // ensure plural like servos, steppers
        id: deviceId,
        command: action,
        value: value,
      };
      if (speed !== undefined) messagePayload.speed = speed;
      if (acceleration !== undefined)
        messagePayload.acceleration = acceleration;
      sendMessage(messagePayload);
    }
  };

  const getDeviceState = (
    deviceId: string,
    property: keyof (DeviceDisplay & {
      position?: number;
      angle?: number;
      value?: any;
    }),
    defaultValue: any
  ) => {
    // Try to get from local state, then from device prop, then default
    const localStateValue = deviceStates[deviceId]?.[property];
    if (localStateValue !== undefined) return localStateValue;

    const device = devices.find((d) => d.id === deviceId);
    // Access known common properties from DeviceDisplay or potential extensions like position/angle
    if (device && property in device) {
      return (device as any)[property];
    }
    // Fallback for specific conventional properties if not directly on DeviceDisplay
    if (device && property === "position")
      return (device as any).position || defaultValue;
    if (device && property === "angle")
      return (device as any).angle || defaultValue;
    if (device && property === "value")
      return (device as any).value || defaultValue;

    return defaultValue;
  };

  // Playback logic that updated local state is removed for now to simplify.
  // If isPlaying is true, controls in DeviceControl might be disabled.

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="steppers">Steppers</TabsTrigger>
          <TabsTrigger value="servos">Servos</TabsTrigger>
          <TabsTrigger value="pins">IO Pins</TabsTrigger>{" "}
          {/* Changed to 'pins' to match HardwareConfig key if applicable */}
        </TabsList>
      </Tabs>

      <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
        {filteredDevices.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p>
              No devices of type '{activeTab !== "all" ? activeTab : "any"}'
              found.
            </p>
            {activeTab === "all" && devices.length === 0 && (
              <p>No devices configured.</p>
            )}
          </div>
        ) : (
          filteredDevices.map((device) => (
            <DeviceControl
              key={device.id}
              device={device} // Now DeviceDisplay
              // isRecording={isRecording} // Propagate if DeviceControl uses it for UI
              isPlaying={isPlaying} // Propagate if DeviceControl uses it
              // isActive={currentStep?.deviceId === device.id} // Removed, simplify
              onChange={handleDeviceChange} // This now triggers onAddStep
              // Pass specific state properties that the control expects, using getDeviceState
              currentPosition={getDeviceState(
                device.id,
                "position",
                (device as any).minPosition || 0
              )}
              currentAngle={getDeviceState(device.id, "angle", 0)}
              currentValue={getDeviceState(device.id, "value", 0)} // For IO
              // Pass other device properties if needed by DeviceControl for rendering (e.g., min/max for sliders)
            />
          ))
        )}
      </div>
    </div>
  );
}

interface DeviceControlProps {
  device: DeviceDisplay; // Changed to DeviceDisplay
  // isRecording?: boolean;
  isPlaying?: boolean;
  // isActive?: boolean;
  onChange: (
    deviceId: string,
    action: string,
    value: any,
    speed?: number,
    acceleration?: number
  ) => void;
  // state: Record<string, any>; // Replaced by specific state props
  currentPosition?: number;
  currentAngle?: number;
  currentValue?: any; // For IO pins, could be boolean or number
}

function DeviceControl({
  device,
  isPlaying,
  onChange,
  currentPosition,
  currentAngle,
  currentValue,
}: DeviceControlProps) {
  // Render different controls based on device type (device.componentGroup or device.originalType)
  switch (
    device.originalType // Using originalType for more specific control rendering
  ) {
    case "Stepper":
      return (
        <div
          className={`p-3 rounded-lg border bg-background shadow-sm ${
            isPlaying ? "opacity-70" : ""
          }`}
        >
          <h3 className="font-medium mb-2 text-sm text-foreground">
            {/* Icon can be added based on device.componentGroup */}
            {device.name}
          </h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Position</span>
                <span className="font-medium text-foreground">
                  {currentPosition ?? (device as any).minPosition ?? 0}
                </span>
              </div>
              <Slider
                value={[currentPosition ?? (device as any).minPosition ?? 0]}
                min={(device as any).minPosition ?? 0}
                max={(device as any).maxPosition ?? 1000} // Ensure max is defined
                step={(device as any).stepsPerUnit ?? 1} // Or a sensible default
                onValueChange={(value) =>
                  onChange(
                    device.id,
                    "moveTo",
                    value[0],
                    (device as any).maxSpeed,
                    (device as any).acceleration
                  )
                }
                disabled={isPlaying}
                className="h-2 data-[disabled]:opacity-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange(
                    device.id,
                    "moveTo",
                    (device as any).minPosition || 0,
                    (device as any).maxSpeed,
                    (device as any).acceleration
                  )
                }
                disabled={isPlaying}
              >
                Go to Min
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange(
                    device.id,
                    "moveTo",
                    (device as any).maxPosition || 0,
                    (device as any).maxSpeed,
                    (device as any).acceleration
                  )
                }
                disabled={isPlaying}
              >
                Go to Max
              </Button>
            </div>
          </div>
        </div>
      );
    case "Servo":
      return (
        <div
          className={`p-3 rounded-lg border bg-background shadow-sm ${
            isPlaying ? "opacity-70" : ""
          }`}
        >
          <h3 className="font-medium mb-2 text-sm text-foreground">
            {device.name}
          </h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Angle</span>
                <span className="font-medium text-foreground">
                  {currentAngle ?? (device as any).minAngle ?? 0}
                </span>
              </div>
              <Slider
                value={[currentAngle ?? (device as any).minAngle ?? 0]}
                min={(device as any).minAngle ?? 0}
                max={(device as any).maxAngle ?? 180}
                step={1}
                onValueChange={(value) =>
                  onChange(device.id, "setAngle", value[0])
                }
                disabled={isPlaying}
                className="h-2 data-[disabled]:opacity-50"
              />
            </div>
            {/* Add buttons for preset angles if device.presets exists */}
            {(device as any).presets &&
              Array.isArray((device as any).presets) &&
              (device as any).presets.length > 0 && (
                <div className="grid grid-cols-3 gap-1 pt-1">
                  {((device as any).presets as number[]).map((presetAngle) => (
                    <Button
                      key={presetAngle}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() =>
                        onChange(device.id, "setAngle", presetAngle)
                      }
                      disabled={isPlaying}
                    >
                      {presetAngle}°
                    </Button>
                  ))}
                </div>
              )}
          </div>
        </div>
      );
    case "Digital Output": // Assuming originalType for IO pins is specific
    case "Digital Input": // Could be an input as well, but not controllable
    case "Relay": // Relays are often like Digital Outputs
      const isOutput =
        device.originalType === "Digital Output" ||
        device.originalType === "Relay";
      return (
        <div
          className={`p-3 rounded-lg border bg-background shadow-sm ${
            isPlaying && isOutput ? "opacity-70" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm text-foreground">
              {device.name}
            </h3>
            {isOutput && (
              <Switch
                checked={!!currentValue} // Ensure boolean
                onCheckedChange={
                  (checked) => onChange(device.id, "setValue", checked ? 1 : 0) // Send 1/0 or true/false based on backend
                }
                disabled={isPlaying}
                aria-label={`Toggle ${device.name}`}
              />
            )}
          </div>
          {!isOutput && (
            <p className="text-xs text-muted-foreground">
              Current value:{" "}
              {currentValue === undefined ? "N/A" : String(currentValue)}{" "}
              (Input)
            </p>
          )}
        </div>
      );
    default:
      return (
        <div className="p-3 rounded-lg border bg-background shadow-sm">
          <h3 className="font-medium text-sm text-foreground">{device.name}</h3>
          <p className="text-xs text-muted-foreground">
            ({device.originalType}) - No direct control UI implemented.
          </p>
        </div>
      );
  }
}
