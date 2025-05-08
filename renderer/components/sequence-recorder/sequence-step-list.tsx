"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  SequenceStep,
  ActionStep,
  DelayStep,
  DeviceDisplay,
  HardwareConfig,
} from "../../../common/types";
import { useSequenceStore } from "@/store/sequenceStore";
import { formatTime } from "./utils";
import {
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  TimerIcon,
  ZapIcon,
  Settings2,
} from "lucide-react";

interface SequenceStepListProps {
  steps: SequenceStep[];
  devices: DeviceDisplay[];
  onDeleteStep: (stepId: string) => void;
  onReorderSteps?: (steps: SequenceStep[]) => void;
}

const initialDialogStepState = {
  stepType: "action" as "action" | "delay",
  deviceId: "",
  action: "",
  value: "" as string | number,
  speed: "" as string | number,
  acceleration: "" as string | number,
  duration: 1000,
  editingStepId: null as string | null,
};

export function SequenceStepList({
  steps,
  devices,
  onDeleteStep,
  onReorderSteps,
}: SequenceStepListProps) {
  const addStepToStore = useSequenceStore((state) => state.addStep);
  const updateStepInStore = useSequenceStore((state) => state.updateStep);

  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [dialogStepData, setDialogStepData] = useState({
    ...initialDialogStepState,
  });

  const getDeviceDetails = (deviceId: string): DeviceDisplay | undefined => {
    return devices.find((d) => d.id === deviceId);
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

  const handleOpenAddDialog = () => {
    setDialogStepData({ ...initialDialogStepState, editingStepId: null });
    setIsStepDialogOpen(true);
  };

  const handleOpenEditDialog = (stepToEdit: SequenceStep) => {
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
      ...(field === "deviceId" && { action: "" }),
    }));
  };

  const handleSaveStepDialog = () => {
    if (dialogStepData.stepType === "action") {
      if (!dialogStepData.deviceId || !dialogStepData.action) {
        console.error("Device and Action are required for an action step.");
        return;
      }
      const device = getDeviceDetails(dialogStepData.deviceId);
      if (!device) {
        console.error("Selected device not found.");
        return;
      }

      const actionStepPayload: Omit<ActionStep, "id" | "type"> = {
        deviceId: dialogStepData.deviceId,
        deviceComponentGroup: device.componentGroup as keyof HardwareConfig,
        action: dialogStepData.action,
        value: parseFloat(String(dialogStepData.value)) || 0,
        ...(dialogStepData.speed && {
          speed: parseFloat(String(dialogStepData.speed)),
        }),
        ...(dialogStepData.acceleration && {
          acceleration: parseFloat(String(dialogStepData.acceleration)),
        }),
      };
      if (dialogStepData.editingStepId) {
        updateStepInStore(dialogStepData.editingStepId, actionStepPayload);
      } else {
        addStepToStore(actionStepPayload);
      }
    } else {
      const delayStepPayload: Omit<DelayStep, "id" | "type"> = {
        duration: Number(dialogStepData.duration) || 0,
      };
      if (dialogStepData.editingStepId) {
        updateStepInStore(dialogStepData.editingStepId, delayStepPayload);
      } else {
        addStepToStore(delayStepPayload);
      }
    }
    setIsStepDialogOpen(false);
  };

  const getStepDisplayInfo = (step: SequenceStep) => {
    if (step.type === "action") {
      const device = getDeviceDetails(step.deviceId);
      return {
        icon: <ZapIcon className="h-5 w-5 text-blue-500" />,
        title: `${device?.name || "N/A"}: ${step.action}`,
        details: `Value: ${step.value}${
          step.speed ? ", Spd: " + step.speed : ""
        }${step.acceleration ? ", Acc: " + step.acceleration : ""}`,
      };
    }
    return {
      icon: <TimerIcon className="h-5 w-5 text-orange-500" />,
      title: "Delay",
      details: `Wait for ${formatTime(step.duration)}`,
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-foreground">
          Sequence Steps
        </h3>
        <Button size="sm" onClick={handleOpenAddDialog} variant="default">
          <Plus className="h-4 w-4 mr-2" /> Add Step
        </Button>
      </div>

      {steps.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Settings2 className="mx-auto h-12 w-12 opacity-50" />
          <p className="mt-2">No steps yet.</p>
          <p className="text-sm">Click "Add Step" to build your sequence.</p>
        </div>
      ) : (
        <div className="space-y-2 h-[calc(100vh-400px)] overflow-y-auto pr-3">
          {steps.map((step, index) => {
            const displayInfo = getStepDisplayInfo(step);
            return (
              <div
                key={step.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card shadow-sm hover:border-primary transition-colors group"
              >
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                  {displayInfo.icon}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {displayInfo.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {displayInfo.details}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleOpenEditDialog(step)}
                    title="Edit Step"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive/90"
                    onClick={() => onDeleteStep(step.id)}
                    title="Delete Step"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {onReorderSteps && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 cursor-grab"
                      title="Drag to reorder (not implemented)"
                    >
                      <GripVertical className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogStepData.editingStepId ? "Edit Step" : "Add New Step"}
            </DialogTitle>
            <DialogDescription>
              {dialogStepData.editingStepId
                ? "Modify the details of this step."
                : "Choose a device action or a delay to add to your sequence."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="stepType">Step Type</Label>
              <Select
                value={dialogStepData.stepType}
                onValueChange={(value: "action" | "delay") =>
                  handleDialogInputChange("stepType", value)
                }
                disabled={!!dialogStepData.editingStepId}
              >
                <SelectTrigger id="stepType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action">Device Action</SelectItem>
                  <SelectItem value="delay">Delay / Wait</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dialogStepData.stepType === "action" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="deviceId">Device</Label>
                  <Select
                    value={dialogStepData.deviceId}
                    onValueChange={(value) =>
                      handleDialogInputChange("deviceId", value)
                    }
                  >
                    <SelectTrigger id="deviceId">
                      <SelectValue placeholder="Select device" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map((device) => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.name} ({device.originalType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {dialogStepData.deviceId && (
                  <div className="grid gap-2">
                    <Label htmlFor="action">Action</Label>
                    <Select
                      value={dialogStepData.action}
                      onValueChange={(value) =>
                        handleDialogInputChange("action", value)
                      }
                    >
                      <SelectTrigger id="action">
                        <SelectValue placeholder="Select action" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableActions(dialogStepData.deviceId).map(
                          (act) => (
                            <SelectItem key={act.value} value={act.value}>
                              {act.label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    value={dialogStepData.value}
                    onChange={(e) =>
                      handleDialogInputChange("value", e.target.value)
                    }
                    placeholder="e.g., 90, 1000, true"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="speed">Speed (optional)</Label>
                    <Input
                      id="speed"
                      type="number"
                      value={dialogStepData.speed}
                      onChange={(e) =>
                        handleDialogInputChange("speed", e.target.value)
                      }
                      placeholder="e.g., 500"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="acceleration">
                      Acceleration (optional)
                    </Label>
                    <Input
                      id="acceleration"
                      type="number"
                      value={dialogStepData.acceleration}
                      onChange={(e) =>
                        handleDialogInputChange("acceleration", e.target.value)
                      }
                      placeholder="e.g., 200"
                    />
                  </div>
                </div>
              </>
            )}

            {dialogStepData.stepType === "delay" && (
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration (ms)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={dialogStepData.duration}
                  onChange={(e) =>
                    handleDialogInputChange("duration", Number(e.target.value))
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSaveStepDialog}>
              Save Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
