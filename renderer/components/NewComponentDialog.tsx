"use client";

import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
interface NewComponentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateComponent: (componentData: any) => void;
}

export function NewComponentDialog({
  open,
  onOpenChange,
  onCreateComponent,
}: NewComponentDialogProps) {
  const [newComponentName, setNewComponentName] = useState("");
  const [componentType, setComponentType] = useState<
    "stepper" | "servo" | "iopin"
  >("stepper");
  const [pins, setPins] = useState({
    step: 0,
    direction: 0,
    enable: 0,
    control: 0,
    ioPin: 0,
  });
  const [pinMode, setPinMode] = useState<"input" | "output">("input");
  const [pinType, setPinType] = useState<"digital" | "analog" | "pwm">(
    "digital"
  );

  const handleCreateComponent = () => {
    const componentData = {
      name: newComponentName,
      type: componentType,
      pins:
        componentType === "stepper"
          ? { step: pins.step, direction: pins.direction, enable: pins.enable }
          : componentType === "servo"
          ? { control: pins.control }
          : { pin: pins.ioPin, mode: pinMode, type: pinType },
    };

    onCreateComponent(componentData);
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setNewComponentName("");
    setComponentType("stepper");
    setPins({
      step: 0,
      direction: 0,
      enable: 0,
      control: 0,
      ioPin: 0,
    });
    setPinMode("input");
    setPinType("digital");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card/80 dark:bg-card/80 backdrop-blur-md border rounded-xl shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Add New Component
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-5">
          <div>
            <Label htmlFor="component-name" className="text-muted-foreground">
              Component Name
            </Label>
            <Input
              id="component-name"
              value={newComponentName}
              onChange={(e) => setNewComponentName(e.target.value)}
              className="mt-1.5 bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
              placeholder="Enter component name"
            />
          </div>

          <div>
            <Label className="mb-2 block text-muted-foreground">
              Component Type
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant={componentType === "stepper" ? "secondary" : "outline"}
                onClick={() => setComponentType("stepper")}
                className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
              >
                Stepper Motor
              </Button>
              <Button
                variant={componentType === "servo" ? "secondary" : "outline"}
                onClick={() => setComponentType("servo")}
                className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
              >
                Servo Motor
              </Button>
              <Button
                variant={componentType === "iopin" ? "secondary" : "outline"}
                onClick={() => setComponentType("iopin")}
                className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
              >
                I/O Pin
              </Button>
            </div>
          </div>

          {componentType === "stepper" ? (
            <div className="space-y-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/20">
              <Label className="text-muted-foreground">Pin Configuration</Label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label
                    htmlFor="step-pin"
                    className="text-xs text-muted-foreground"
                  >
                    Step Pin
                  </Label>
                  <Input
                    id="step-pin"
                    type="text"
                    inputMode="numeric"
                    value={pins.step === 0 ? "" : pins.step.toString()}
                    onChange={(e) =>
                      setPins({ ...pins, step: Number(e.target.value) || 0 })
                    }
                    className="mt-1 bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="dir-pin"
                    className="text-xs text-muted-foreground"
                  >
                    Direction Pin
                  </Label>
                  <Input
                    id="dir-pin"
                    type="text"
                    inputMode="numeric"
                    value={
                      pins.direction === 0 ? "" : pins.direction.toString()
                    }
                    onChange={(e) =>
                      setPins({
                        ...pins,
                        direction: Number(e.target.value) || 0,
                      })
                    }
                    className="mt-1 bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="enable-pin"
                    className="text-xs text-muted-foreground"
                  >
                    Enable Pin (Opt.)
                  </Label>
                  <Input
                    id="enable-pin"
                    type="text"
                    inputMode="numeric"
                    value={pins.enable === 0 ? "" : pins.enable.toString()}
                    onChange={(e) =>
                      setPins({ ...pins, enable: Number(e.target.value) || 0 })
                    }
                    placeholder="None"
                    className="mt-1 bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          ) : componentType === "servo" ? (
            <div className="space-y-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/20">
              <Label htmlFor="control-pin" className="text-muted-foreground">
                Control Pin
              </Label>
              <Input
                id="control-pin"
                type="text"
                inputMode="numeric"
                value={pins.control === 0 ? "" : pins.control.toString()}
                onChange={(e) =>
                  setPins({ ...pins, control: Number(e.target.value) || 0 })
                }
                className="mt-1 bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
              />
            </div>
          ) : (
            // IO Pin settings
            <div className="space-y-4 p-3 rounded-lg bg-muted/30 dark:bg-muted/20">
              <div>
                <Label htmlFor="io-pin" className="text-muted-foreground">
                  Pin Number
                </Label>
                <Input
                  id="io-pin"
                  type="text"
                  inputMode="numeric"
                  value={pins.ioPin === 0 ? "" : pins.ioPin.toString()}
                  onChange={(e) =>
                    setPins({ ...pins, ioPin: Number(e.target.value) || 0 })
                  }
                  className="mt-1 bg-muted/50 border-input text-foreground rounded-lg placeholder:text-muted-foreground focus-visible:ring-ring"
                />
              </div>

              <div>
                <Label className="mb-2 block text-muted-foreground">
                  Pin Mode
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={pinMode === "input" ? "secondary" : "outline"}
                    onClick={() => setPinMode("input")}
                    className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
                  >
                    Input
                  </Button>
                  <Button
                    variant={pinMode === "output" ? "secondary" : "outline"}
                    onClick={() => setPinMode("output")}
                    className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
                  >
                    Output
                  </Button>
                </div>
              </div>

              <div>
                <Label className="mb-2 block text-muted-foreground">
                  Pin Type
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Button
                    variant={pinType === "digital" ? "secondary" : "outline"}
                    onClick={() => setPinType("digital")}
                    className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
                  >
                    Digital
                  </Button>
                  <Button
                    variant={pinType === "analog" ? "secondary" : "outline"}
                    onClick={() => setPinType("analog")}
                    className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
                    disabled={pinMode === "output"}
                  >
                    Analog
                  </Button>
                  {pinMode === "output" && (
                    <Button
                      variant={pinType === "pwm" ? "secondary" : "outline"}
                      onClick={() => setPinType("pwm")}
                      className="w-full justify-center p-3 h-auto text-xs sm:text-sm rounded-md"
                    >
                      PWM
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-lg">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleCreateComponent}
            disabled={!newComponentName.trim()}
            variant="default"
            className="rounded-lg shadow-md"
          >
            Create {componentType === "iopin" ? "IO Pin" : "Motor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
