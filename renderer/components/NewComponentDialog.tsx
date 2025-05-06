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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
      <DialogContent className="sm:max-w-[425px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Add New Component
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-5">
          <div>
            <Label
              htmlFor="component-name"
              className="text-gray-700 dark:text-gray-300"
            >
              Component Name
            </Label>
            <Input
              id="component-name"
              value={newComponentName}
              onChange={(e) => setNewComponentName(e.target.value)}
              className="mt-1.5 bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg"
              placeholder="Enter component name"
            />
          </div>

          <div>
            <Label className="mb-2 block text-gray-700 dark:text-gray-300">
              Component Type
            </Label>
            <RadioGroup
              className="text-gray-700 dark:text-gray-300 space-y-2"
              value={componentType}
              onValueChange={(value: "stepper" | "servo" | "iopin") =>
                setComponentType(value)
              }
            >
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors">
                <RadioGroupItem value="stepper" id="stepper" />
                <Label htmlFor="stepper" className="cursor-pointer">
                  Stepper Motor
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors">
                <RadioGroupItem value="servo" id="servo" />
                <Label htmlFor="servo" className="cursor-pointer">
                  Servo Motor
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors">
                <RadioGroupItem value="iopin" id="iopin" />
                <Label htmlFor="iopin" className="cursor-pointer">
                  I/O Pin
                </Label>
              </div>
            </RadioGroup>
          </div>

          {componentType === "stepper" ? (
            <div className="space-y-3 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-700/30 backdrop-blur-sm">
              <Label className="text-gray-700 dark:text-gray-300">
                Pin Configuration
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label
                    htmlFor="step-pin"
                    className="text-xs text-gray-600 dark:text-gray-400"
                  >
                    Step Pin
                  </Label>
                  <Input
                    id="step-pin"
                    type="number"
                    value={pins.step}
                    onChange={(e) =>
                      setPins({ ...pins, step: Number(e.target.value) })
                    }
                    className="mt-1 bg-white/70 dark:bg-gray-800/70 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="dir-pin"
                    className="text-xs text-gray-600 dark:text-gray-400"
                  >
                    Direction Pin
                  </Label>
                  <Input
                    id="dir-pin"
                    type="number"
                    value={pins.direction}
                    onChange={(e) =>
                      setPins({ ...pins, direction: Number(e.target.value) })
                    }
                    className="mt-1 bg-white/70 dark:bg-gray-800/70 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="enable-pin"
                    className="text-xs text-gray-600 dark:text-gray-400"
                  >
                    Enable Pin (Opt.)
                  </Label>
                  <Input
                    id="enable-pin"
                    type="number"
                    value={pins.enable}
                    onChange={(e) =>
                      setPins({ ...pins, enable: Number(e.target.value) })
                    }
                    placeholder="None"
                    className="mt-1 bg-white/70 dark:bg-gray-800/70 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg"
                  />
                </div>
              </div>
            </div>
          ) : componentType === "servo" ? (
            <div className="space-y-3 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-700/30 backdrop-blur-sm">
              <Label
                htmlFor="control-pin"
                className="text-gray-700 dark:text-gray-300"
              >
                Control Pin
              </Label>
              <Input
                id="control-pin"
                type="number"
                value={pins.control}
                onChange={(e) =>
                  setPins({ ...pins, control: Number(e.target.value) })
                }
                className="mt-1 bg-white/70 dark:bg-gray-800/70 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg"
              />
            </div>
          ) : (
            // IO Pin settings
            <div className="space-y-4 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-700/30 backdrop-blur-sm">
              <div>
                <Label
                  htmlFor="io-pin"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Pin Number
                </Label>
                <Input
                  id="io-pin"
                  type="number"
                  value={pins.ioPin}
                  onChange={(e) =>
                    setPins({ ...pins, ioPin: Number(e.target.value) })
                  }
                  className="mt-1 bg-white/70 dark:bg-gray-800/70 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg"
                />
              </div>

              <div>
                <Label className="mb-2 block text-gray-700 dark:text-gray-300">
                  Pin Mode
                </Label>
                <RadioGroup
                  className="text-gray-700 dark:text-gray-300 flex space-x-4"
                  value={pinMode}
                  onValueChange={(value: "input" | "output") =>
                    setPinMode(value)
                  }
                >
                  <div className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
                    <RadioGroupItem value="input" id="input" />
                    <Label htmlFor="input" className="cursor-pointer">
                      Input
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
                    <RadioGroupItem value="output" id="output" />
                    <Label htmlFor="output" className="cursor-pointer">
                      Output
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label className="mb-2 block text-gray-700 dark:text-gray-300">
                  Pin Type
                </Label>
                <RadioGroup
                  className="text-gray-700 dark:text-gray-300 flex flex-wrap gap-2"
                  value={pinType}
                  onValueChange={(value: "digital" | "analog" | "pwm") =>
                    setPinType(value)
                  }
                >
                  <div className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
                    <RadioGroupItem value="digital" id="digital" />
                    <Label htmlFor="digital" className="cursor-pointer">
                      Digital
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
                    <RadioGroupItem value="analog" id="analog" />
                    <Label htmlFor="analog" className="cursor-pointer">
                      Analog
                    </Label>
                  </div>
                  {pinMode === "output" && (
                    <div className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
                      <RadioGroupItem value="pwm" id="pwm" />
                      <Label htmlFor="pwm" className="cursor-pointer">
                        PWM
                      </Label>
                    </div>
                  )}
                </RadioGroup>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button
              variant="outline"
              className="text-gray-700 dark:text-gray-300 border-gray-300/50 dark:border-gray-600/50 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg"
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleCreateComponent}
            disabled={!newComponentName.trim()}
            className="bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg shadow-md"
          >
            Create {componentType === "iopin" ? "IO Pin" : "Motor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
