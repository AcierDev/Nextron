"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { SequenceStep, Device } from "./sequence-page";
import { formatTime } from "./utils";
import { Plus, Trash2, Clock, ArrowRight } from "lucide-react";

interface SequenceStepListProps {
  steps: SequenceStep[];
  devices: Device[];
  onUpdateStep: (stepId: string, data: Partial<SequenceStep>) => void;
  onDeleteStep: (stepId: string) => void;
  onAddStep: (step: Omit<SequenceStep, "id" | "timestamp">) => void;
  currentStepIndex: number;
}

export function SequenceStepList({
  steps,
  devices,
  onUpdateStep,
  onDeleteStep,
  onAddStep,
  currentStepIndex,
}: SequenceStepListProps) {
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [newStep, setNewStep] = useState({
    deviceId: "",
    action: "",
    value: 0,
    duration: 1000,
  });

  // Get device type and name
  const getDeviceInfo = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    return {
      type: device?.type || "",
      name: device?.name || "",
    };
  };

  // Get available actions for device type
  const getAvailableActions = (deviceType: string) => {
    switch (deviceType) {
      case "stepper":
        return [
          { value: "moveTo", label: "Move To Position" },
          { value: "setSpeed", label: "Set Speed" },
          { value: "setAcceleration", label: "Set Acceleration" },
        ];
      case "servo":
        return [{ value: "setAngle", label: "Set Angle" }];
      case "io":
        return [{ value: "setValue", label: "Set Value" }];
      default:
        return [];
    }
  };

  // Handle adding a new step
  const handleAddStep = () => {
    const { type: deviceType, name: deviceName } = getDeviceInfo(
      newStep.deviceId
    );

    onAddStep({
      deviceId: newStep.deviceId,
      deviceType,
      deviceName,
      action: newStep.action,
      value: newStep.value,
      duration: newStep.duration,
    });

    setIsAddStepOpen(false);
    setNewStep({
      deviceId: "",
      action: "",
      value: 0,
      duration: 1000,
    });
  };

  // Get icon for device type
  const getDeviceIcon = (type: string) => {
    switch (type) {
      case "stepper":
        return "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400";
      case "servo":
        return "bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400";
      case "io":
        return "bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400";
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";
    }
  };

  // Get action description
  const getActionDescription = (step: SequenceStep) => {
    switch (step.action) {
      case "moveTo":
        return `Move to ${step.value} steps`;
      case "setSpeed":
        return `Set speed to ${step.value}`;
      case "setAcceleration":
        return `Set acceleration to ${step.value}`;
      case "setAngle":
        return `Set angle to ${step.value}°`;
      case "setValue":
        return `Set value to ${step.value === 1 ? "ON" : "OFF"}`;
      default:
        return `${step.action}: ${step.value}`;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Sequence Steps</h3>
        <Button
          size="sm"
          onClick={() => setIsAddStepOpen(true)}
          className="flex items-center gap-1 bg-blue-600/90 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4" />
          Add Step
        </Button>
      </div>

      {steps.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No steps recorded yet. Start recording or add steps manually.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`p-3 rounded-lg backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 ${
                index === currentStepIndex
                  ? "ring-2 ring-blue-500 dark:ring-blue-400 border-transparent"
                  : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${getDeviceIcon(
                    step.deviceType
                  )}`}
                >
                  {step.deviceType.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-medium">{step.deviceName}</span>
                      <span className="mx-1.5 text-gray-300 dark:text-gray-600">
                        •
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatTime(step.timestamp)}
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                      onClick={() => onDeleteStep(step.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-1 flex items-center text-sm">
                    <span className="font-medium">
                      {getActionDescription(step)}
                    </span>
                    {step.duration > 0 && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <ArrowRight className="h-3 w-3 mx-1" />
                        {step.duration}ms
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Step Dialog */}
      <Dialog open={isAddStepOpen} onOpenChange={setIsAddStepOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle>Add New Step</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="device">Device</Label>
              <Select
                value={newStep.deviceId}
                onValueChange={(value) => {
                  setNewStep({ ...newStep, deviceId: value, action: "" });
                }}
              >
                <SelectTrigger
                  id="device"
                  className="bg-white/70 dark:bg-gray-700/70 border-gray-300/50 dark:border-gray-600/50"
                >
                  <SelectValue placeholder="Select device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newStep.deviceId && (
              <div className="grid gap-2">
                <Label htmlFor="action">Action</Label>
                <Select
                  value={newStep.action}
                  onValueChange={(value) =>
                    setNewStep({ ...newStep, action: value })
                  }
                >
                  <SelectTrigger
                    id="action"
                    className="bg-white/70 dark:bg-gray-700/70 border-gray-300/50 dark:border-gray-600/50"
                  >
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableActions(
                      getDeviceInfo(newStep.deviceId).type
                    ).map((action) => (
                      <SelectItem key={action.value} value={action.value}>
                        {action.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newStep.action && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    type="number"
                    value={newStep.value}
                    onChange={(e) =>
                      setNewStep({ ...newStep, value: Number(e.target.value) })
                    }
                    className="bg-white/70 dark:bg-gray-700/70 border-gray-300/50 dark:border-gray-600/50"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="duration">Duration (ms)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={newStep.duration}
                    onChange={(e) =>
                      setNewStep({
                        ...newStep,
                        duration: Number(e.target.value),
                      })
                    }
                    className="bg-white/70 dark:bg-gray-700/70 border-gray-300/50 dark:border-gray-600/50"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    How long this action takes to complete (0 for instant)
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="border-gray-300/50 dark:border-gray-600/50"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleAddStep}
              disabled={!newStep.deviceId || !newStep.action}
              className="bg-blue-600/90 hover:bg-blue-700 text-white"
            >
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
