"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SequenceStep, DeviceDisplay } from "../../../common/types";
import { formatTime } from "./utils";
import { Edit2, Trash2, GripVertical, TimerIcon, ZapIcon } from "lucide-react";

interface SequenceTimelineProps {
  steps: SequenceStep[];
  devices: DeviceDisplay[];
  onStepSelect?: (stepId: string) => void;
  onUpdateStep?: (stepId: string, data: Partial<SequenceStep>) => void;
  onDeleteStep?: (stepId: string) => void;
  onReorderSteps?: (steps: SequenceStep[]) => void;
}

export function SequenceTimeline({
  steps,
  devices,
  onStepSelect,
  onUpdateStep,
  onDeleteStep,
  onReorderSteps,
}: SequenceTimelineProps) {
  const getDeviceDetails = (deviceId: string): DeviceDisplay | undefined => {
    return devices.find((d) => d.id === deviceId);
  };

  const getStepTitle = (step: SequenceStep): string => {
    if (step.type === "action") {
      const device = getDeviceDetails(step.deviceId);
      return `${device?.name || "Unknown Device"}: ${step.action}`;
    }
    return "Delay";
  };

  const getStepDescription = (step: SequenceStep): string => {
    if (step.type === "action") {
      let description = `Value: ${step.value}`;
      if (step.speed) description += `, Speed: ${step.speed}`;
      if (step.acceleration) description += `, Accel: ${step.acceleration}`;
      return description;
    }
    return `Wait for ${formatTime(step.duration)}`;
  };

  const getStepIcon = (step: SequenceStep) => {
    if (step.type === "delay")
      return <TimerIcon className="h-5 w-5 text-orange-500" />;
    if (step.type === "action") {
      return <ZapIcon className="h-5 w-5 text-blue-500" />;
    }
    return <ZapIcon className="h-5 w-5 text-gray-500" />;
  };

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No steps in the sequence. Add actions or delays.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-1">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className="flex items-center gap-3 p-3 rounded-lg border bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onStepSelect && onStepSelect(step.id)}
        >
          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted">
            {getStepIcon(step)}
          </div>
          <div className="flex-grow min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {getStepTitle(step)}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {getStepDescription(step)}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onUpdateStep && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("Edit step clicked (timeline):", step.id);
                }}
                title="Edit Step"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {onDeleteStep && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive/90"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteStep(step.id);
                }}
                title="Delete Step"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {onReorderSteps && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 cursor-grab"
                title="Drag to reorder (not implemented)"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
