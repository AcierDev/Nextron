"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SequenceStep } from "./sequence-page";
import { formatTime } from "./utils";
import { Edit2, Trash2, GripVertical } from "lucide-react";

interface SequenceTimelineProps {
  steps: SequenceStep[];
  currentStepIndex: number;
  onUpdateStep: (stepId: string, data: Partial<SequenceStep>) => void;
  onDeleteStep: (stepId: string) => void;
  onReorderSteps: (steps: SequenceStep[]) => void;
}

export function SequenceTimeline({
  steps,
  currentStepIndex,
  onUpdateStep,
  onDeleteStep,
  onReorderSteps,
}: SequenceTimelineProps) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  // Calculate the total duration of the sequence
  const totalDuration =
    steps.length > 0 ? steps[steps.length - 1].timestamp + 1000 : 0;

  // Get color based on device type
  const getDeviceColor = (type: string) => {
    switch (type) {
      case "stepper":
        return "bg-blue-500 dark:bg-blue-600";
      case "servo":
        return "bg-purple-500 dark:bg-purple-600";
      case "io":
        return "bg-amber-500 dark:bg-amber-600";
      default:
        return "bg-gray-500 dark:bg-gray-600";
    }
  };

  // Get text color based on device type
  const getDeviceTextColor = (type: string) => {
    switch (type) {
      case "stepper":
        return "text-blue-600 dark:text-blue-400";
      case "servo":
        return "text-purple-600 dark:text-purple-400";
      case "io":
        return "text-amber-600 dark:text-amber-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  // Get border color based on device type
  const getDeviceBorderColor = (type: string) => {
    switch (type) {
      case "stepper":
        return "border-blue-200 dark:border-blue-800";
      case "servo":
        return "border-purple-200 dark:border-purple-800";
      case "io":
        return "border-amber-200 dark:border-amber-800";
      default:
        return "border-gray-200 dark:border-gray-700";
    }
  };

  // Get action description
  const getActionDescription = (step: SequenceStep) => {
    switch (step.action) {
      case "moveTo":
        return `Move to ${step.value} steps`;
      case "setAngle":
        return `Set angle to ${step.value}°`;
      case "setValue":
        return `Set value to ${step.value === 1 ? "ON" : "OFF"}`;
      default:
        return `${step.action}: ${step.value}`;
    }
  };

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No steps recorded yet. Start recording or add steps manually.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 relative">
      {/* Timeline ruler */}
      <div className="absolute left-0 top-0 h-full w-px bg-gray-200 dark:bg-gray-700"></div>

      {/* Steps */}
      {steps.map((step, index) => {
        const leftPosition = (step.timestamp / totalDuration) * 100;
        const widthPercentage = Math.max(
          1,
          (step.duration / totalDuration) * 100
        );
        const isCurrentStep = index === currentStepIndex;

        return (
          <div
            key={step.id}
            className={`relative pl-6 py-2 mb-1 rounded-r-lg transition-all ${
              isCurrentStep
                ? "bg-gray-100/80 dark:bg-gray-700/80 border-l-2 border-blue-500 dark:border-blue-400"
                : ""
            }`}
            style={{
              marginLeft: `${leftPosition}%`,
              width: step.duration > 0 ? `${widthPercentage}%` : "auto",
              minWidth: "200px",
            }}
          >
            {/* Timeline node */}
            <div
              className={`absolute left-0 top-1/2 w-4 h-4 rounded-full -translate-x-2 -translate-y-1/2 ${getDeviceColor(
                step.deviceType
              )}`}
            ></div>

            {/* Step content */}
            <div
              className={`flex items-center justify-between p-2 rounded-lg backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border ${getDeviceBorderColor(
                step.deviceType
              )}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <span
                    className={`text-xs font-medium ${getDeviceTextColor(
                      step.deviceType
                    )}`}
                  >
                    {step.deviceName}
                  </span>
                  <span className="mx-1.5 text-gray-300 dark:text-gray-600">
                    •
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(step.timestamp)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">
                  {getActionDescription(step)}
                </p>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  onClick={() => setEditingStepId(step.id)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                  onClick={() => onDeleteStep(step.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 cursor-grab dark:text-gray-500"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
