"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ChevronRight,
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

      let parsedValue: number | boolean | string = 0;
      const valueString = String(dialogStepData.value);
      if (dialogStepData.action === "setValue") {
        parsedValue = parseInt(valueString) === 1 ? 1 : 0;
      } else {
        parsedValue = parseFloat(valueString);
        if (isNaN(parsedValue)) {
          console.error("Invalid numeric value for action.");
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
        updateStepInStore(dialogStepData.editingStepId, {
          type: "action",
          ...actionStepPayload,
        });
      } else {
        addStepToStore(actionStepPayload);
      }
    } else {
      const durationValue = Number(dialogStepData.duration);
      if (isNaN(durationValue) || durationValue <= 0) {
        console.error("Invalid duration for delay step.");
        return;
      }
      const delayStepPayload: Omit<DelayStep, "id" | "type"> = {
        duration: durationValue,
      };
      if (dialogStepData.editingStepId) {
        updateStepInStore(dialogStepData.editingStepId, {
          type: "delay",
          ...delayStepPayload,
        });
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
                  {devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      (No devices found in configuration)
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {devices.map((device) => (
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
                        type={
                          dialogStepData.action === "setValue" ? "text" : "text"
                        }
                        inputMode={
                          dialogStepData.action === "setValue"
                            ? "numeric"
                            : "decimal"
                        }
                        min={
                          dialogStepData.action === "setValue" ? 0 : undefined
                        }
                        max={
                          dialogStepData.action === "setValue" ? 1 : undefined
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
