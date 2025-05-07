"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Device, SequenceStep } from "./sequence-page";

interface SequenceDevicePanelProps {
  devices: Device[];
  isRecording: boolean;
  onRecordStep: (
    deviceId: string,
    action: string,
    value: number,
    duration?: number
  ) => void;
  currentStep: SequenceStep | null;
  isPlaying: boolean;
}

export function SequenceDevicePanel({
  devices,
  isRecording,
  onRecordStep,
  currentStep,
  isPlaying,
}: SequenceDevicePanelProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [deviceStates, setDeviceStates] = useState<Record<string, any>>({});

  // Filter devices based on active tab
  const filteredDevices =
    activeTab === "all"
      ? devices
      : devices.filter((device) => device.type === activeTab);

  // Handle device value change
  const handleDeviceChange = (
    deviceId: string,
    action: string,
    value: number,
    duration = 0
  ) => {
    // Update local state
    setDeviceStates((prev) => ({
      ...prev,
      [deviceId]: {
        ...prev[deviceId],
        [action.replace("set", "").toLowerCase()]: value,
      },
    }));

    // Record step if recording
    if (isRecording) {
      onRecordStep(deviceId, action, value, duration);
    }
  };

  // Get device state
  const getDeviceState = (
    deviceId: string,
    property: string,
    defaultValue: any
  ) => {
    return deviceStates[deviceId]?.[property] !== undefined
      ? deviceStates[deviceId][property]
      : defaultValue;
  };

  // Apply current step during playback
  if (isPlaying && currentStep) {
    const { deviceId, action, value } = currentStep;
    const property = action.replace("set", "").toLowerCase();

    // Update device state if it's different
    if (getDeviceState(deviceId, property, null) !== value) {
      setDeviceStates((prev) => ({
        ...prev,
        [deviceId]: {
          ...prev[deviceId],
          [property]: value,
        },
      }));
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="all" className="text-xs">
            All
          </TabsTrigger>
          <TabsTrigger value="stepper" className="text-xs">
            Steppers
          </TabsTrigger>
          <TabsTrigger value="servo" className="text-xs">
            Servos
          </TabsTrigger>
          <TabsTrigger value="io" className="text-xs">
            IO Pins
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
        {filteredDevices.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            <p>No devices found</p>
          </div>
        ) : (
          filteredDevices.map((device) => (
            <DeviceControl
              key={device.id}
              device={device}
              isRecording={isRecording}
              isPlaying={isPlaying}
              isActive={currentStep?.deviceId === device.id}
              onChange={handleDeviceChange}
              state={deviceStates[device.id] || {}}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface DeviceControlProps {
  device: Device;
  isRecording: boolean;
  isPlaying: boolean;
  isActive: boolean;
  onChange: (
    deviceId: string,
    action: string,
    value: number,
    duration?: number
  ) => void;
  state: Record<string, any>;
}

function DeviceControl({
  device,
  isRecording,
  isPlaying,
  isActive,
  onChange,
  state,
}: DeviceControlProps) {
  // Render different controls based on device type
  switch (device.type) {
    case "stepper":
      return (
        <div
          className={`p-3 rounded-lg backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 ${
            isActive
              ? "ring-2 ring-blue-500 dark:ring-blue-400 border-transparent"
              : ""
          }`}
        >
          <h3 className="font-medium mb-2 flex items-center">
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
            {device.name}
          </h3>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">
                  Position
                </span>
                <span className="font-medium">
                  {state.position || device.position}
                </span>
              </div>
              <Slider
                value={[state.position || device.position]}
                min={device.minPosition}
                max={device.maxPosition}
                step={100}
                onValueChange={(value) =>
                  onChange(device.id, "moveTo", value[0], 2000)
                }
                disabled={isPlaying}
                className="h-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChange(device.id, "moveTo", 0, 2000)}
                disabled={isPlaying}
                className="text-xs h-8"
              >
                Home
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange(device.id, "moveTo", device.maxPosition / 2, 2000)
                }
                disabled={isPlaying}
                className="text-xs h-8"
              >
                Center
              </Button>
            </div>
          </div>
        </div>
      );

    case "servo":
      return (
        <div
          className={`p-3 rounded-lg backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 ${
            isActive
              ? "ring-2 ring-purple-500 dark:ring-purple-400 border-transparent"
              : ""
          }`}
        >
          <h3 className="font-medium mb-2 flex items-center">
            <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
            {device.name}
          </h3>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Angle</span>
                <span className="font-medium">
                  {state.angle || device.angle}°
                </span>
              </div>
              <Slider
                value={[state.angle || device.angle]}
                min={device.minAngle}
                max={device.maxAngle}
                step={1}
                onValueChange={(value) =>
                  onChange(device.id, "setAngle", value[0], 1000)
                }
                disabled={isPlaying}
                className="h-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange(device.id, "setAngle", device.minAngle, 1000)
                }
                disabled={isPlaying}
                className="text-xs h-8"
              >
                Min
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChange(device.id, "setAngle", 90, 1000)}
                disabled={isPlaying}
                className="text-xs h-8"
              >
                90°
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange(device.id, "setAngle", device.maxAngle, 1000)
                }
                disabled={isPlaying}
                className="text-xs h-8"
              >
                Max
              </Button>
            </div>
          </div>
        </div>
      );

    case "io":
      return (
        <div
          className={`p-3 rounded-lg backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 ${
            isActive
              ? "ring-2 ring-amber-500 dark:ring-amber-400 border-transparent"
              : ""
          }`}
        >
          <h3 className="font-medium mb-2 flex items-center">
            <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
            {device.name}
          </h3>

          <div className="space-y-3">
            {device.pinType === "digital" ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  State
                </span>
                <Switch
                  checked={state.value === 1 || device.value === 1}
                  onCheckedChange={(checked) =>
                    onChange(device.id, "setValue", checked ? 1 : 0, 0)
                  }
                  disabled={isPlaying || device.mode === "input"}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">
                    Value
                  </span>
                  <span className="font-medium">
                    {state.value || device.value}
                  </span>
                </div>
                <Slider
                  value={[state.value || device.value]}
                  min={0}
                  max={device.pinType === "analog" ? 1023 : 255}
                  step={1}
                  onValueChange={(value) =>
                    onChange(device.id, "setValue", value[0], 0)
                  }
                  disabled={isPlaying || device.mode === "input"}
                  className="h-2"
                />
              </div>
            )}

            {device.mode === "output" && device.pinType !== "digital" && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onChange(device.id, "setValue", 0, 0)}
                  disabled={isPlaying}
                  className="text-xs h-8"
                >
                  Min
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onChange(
                      device.id,
                      "setValue",
                      device.pinType === "analog" ? 1023 : 255,
                      0
                    )
                  }
                  disabled={isPlaying}
                  className="text-xs h-8"
                >
                  Max
                </Button>
              </div>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
}
