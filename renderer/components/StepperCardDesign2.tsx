"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Home,
  ArrowLeft,
  ArrowRight,
  MoveHorizontal,
  Settings,
  Gauge,
  Trash2,
  Copy,
  Edit,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Define WebSocket message sending function type
type SendMessage = (message: object) => void;

interface StepperCardProps {
  id: string;
  name: string;
  position: number; // Live position from dashboard state
  speed: number;
  acceleration: number;
  stepsPerInch: number;
  minPosition: number;
  maxPosition: number;
  pins: {
    step: number;
    direction: number;
    enable?: number;
  };
  onDelete: () => void;
  onDuplicate: () => void;
  onEditPins: () => void;
  sendMessage: SendMessage; // Added sendMessage prop
  onSettingsChange?: (
    id: string,
    newSettings: {
      minPosition?: number;
      maxPosition?: number;
      stepsPerInch?: number;
      jogUnit?: "steps" | "inches";
      jogAmount?: number; // Corresponds to steps if jogUnit is steps
      jogAmountInches?: number; // Corresponds to inches if jogUnit is inches
      speed?: number;
      acceleration?: number;
    }
  ) => void;
  initialJogUnit?: "steps" | "inches";
  initialJogAmount?: number;
  initialJogAmountInches?: number;
}

export default function StepperCardDesign2({
  id,
  name,
  position, // Use the passed-in position directly
  speed: initialSpeed,
  acceleration: initialAcceleration,
  stepsPerInch: initialStepsPerInch,
  minPosition: initialMinPosition,
  maxPosition: initialMaxPosition,
  pins,
  onDelete,
  onDuplicate,
  onEditPins,
  sendMessage, // Destructure sendMessage
  onSettingsChange,
  initialJogUnit,
  initialJogAmount,
  initialJogAmountInches,
}: StepperCardProps) {
  // Settings State (can be adjusted by user)
  const [speed, setSpeed] = useState(initialSpeed);
  const [acceleration, setAcceleration] = useState(initialAcceleration);
  const [stepsPerInch, setStepsPerInch] = useState(initialStepsPerInch);
  const [minPosition, setMinPosition] = useState(initialMinPosition);
  const [maxPosition, setMaxPosition] = useState(initialMaxPosition);

  // String states for inputs
  const [stepsPerInchInput, setStepsPerInchInput] = useState<string>(
    initialStepsPerInch.toString()
  );
  const [minPositionInput, setMinPositionInput] = useState<string>(
    initialMinPosition.toString()
  );
  const [maxPositionInput, setMaxPositionInput] = useState<string>(
    initialMaxPosition.toString()
  );

  // Target State (Updated for combined input)
  const [targetMoveValue, setTargetMoveValue] = useState<string>("0"); // Store input as string
  const [moveToUnit, setMoveToUnit] = useState<"steps" | "inches">("steps"); // State for unit selection

  // Jogging State - Initialize from props or defaults
  const [jogUnit, setJogUnit] = useState<"steps" | "inches">(
    initialJogUnit ?? "steps"
  );

  const [jogAmount, setJogAmount] = useState(initialJogAmount ?? 200); // Numeric state for steps
  const [jogAmountInput, setJogAmountInput] = useState<string>(
    (initialJogAmount ?? 200).toString()
  );

  const [jogAmountInches, setJogAmountInches] = useState(
    initialJogAmountInches ?? 0.1
  ); // Numeric state for inches
  const [jogAmountInchesInput, setJogAmountInchesInput] = useState<string>(
    (initialJogAmountInches ?? 0.1).toString()
  );

  // Continuous Movement State
  const [isMovingLeft, setIsMovingLeft] = useState(false);
  const [isMovingRight, setIsMovingRight] = useState(false);
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to hold interval ID

  // Effect to sync with prop changes
  useEffect(() => {
    setSpeed(initialSpeed);
    setAcceleration(initialAcceleration);
    setStepsPerInch(initialStepsPerInch);
    setMinPosition(initialMinPosition);
    setMaxPosition(initialMaxPosition);

    // Sync string inputs with initial prop-derived values
    setStepsPerInchInput(initialStepsPerInch.toString());
    setMinPositionInput(initialMinPosition.toString());
    setMaxPositionInput(initialMaxPosition.toString());

    // Sync jog settings from props
    setJogUnit(initialJogUnit ?? "steps");
    setJogAmount(initialJogAmount ?? 200);
    setJogAmountInput((initialJogAmount ?? 200).toString());
    setJogAmountInches(initialJogAmountInches ?? 0.1);
    setJogAmountInchesInput((initialJogAmountInches ?? 0.1).toString());
  }, [
    initialSpeed,
    initialAcceleration,
    initialStepsPerInch,
    initialMinPosition,
    initialMaxPosition,
    initialJogUnit,
    initialJogAmount,
    initialJogAmountInches,
  ]);

  // Effect to send min/max/stepsPerInch changes back to the server
  useEffect(() => {
    // Send configuration updates when these values change
    const handleConfigUpdate = () => {
      console.log(
        `[StepperCard ${id}] Updating configuration: min=${minPosition}, max=${maxPosition}, stepsPerInch=${stepsPerInch}`
      );
      sendMessage({
        action: "control",
        componentGroup: "steppers",
        id,
        command: "setParams",
        minPosition,
        maxPosition,
        stepsPerInch,
      });
    };

    // Add a small delay to avoid rapid config changes
    const timeoutId = setTimeout(handleConfigUpdate, 500);
    return () => clearTimeout(timeoutId);
  }, [minPosition, maxPosition, stepsPerInch, id, sendMessage]);

  // Effects to sync string inputs if primary numeric state changes
  useEffect(() => {
    setStepsPerInchInput(stepsPerInch.toString());
  }, [stepsPerInch]);

  useEffect(() => {
    setMinPositionInput(minPosition.toString());
  }, [minPosition]);

  useEffect(() => {
    setMaxPositionInput(maxPosition.toString());
  }, [maxPosition]);

  useEffect(() => {
    // Update input string if numeric state changes (e.g. from initial load or other logic)
    // Ensure not to cause infinite loops if typing fast while also saving to localStorage
    const currentNumStr = jogAmount.toString();
    if (jogAmountInput !== currentNumStr) {
      setJogAmountInput(currentNumStr);
    }
  }, [jogAmount]); // Removed jogAmountInput from dependency array if it was there before

  useEffect(() => {
    const currentNumStr = jogAmountInches.toString();
    if (jogAmountInchesInput !== currentNumStr) {
      setJogAmountInchesInput(currentNumStr);
    }
  }, [jogAmountInches]); // Removed jogAmountInchesInput from dependency array

  // Effect to handle continuous movement via repeated step commands
  useEffect(() => {
    const stepAmountForHold = 100; // Adjust step size for hold smoothness
    const intervalDuration = 100; // Adjust interval speed (ms)

    if ((isMovingLeft || isMovingRight) && !moveIntervalRef.current) {
      const directionMultiplier = isMovingLeft ? -1 : 1;
      const stepsToMove = stepAmountForHold * directionMultiplier;

      moveIntervalRef.current = setInterval(() => {
        console.log(`[StepperCard ${id}] Sending hold step: ${stepsToMove}`);
        sendMessage({
          action: "control",
          componentGroup: "steppers",
          id: id,
          command: "step",
          value: stepsToMove,
        });
      }, intervalDuration);
    } else if (!isMovingLeft && !isMovingRight && moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
      console.log(`[StepperCard ${id}] Clearing hold interval.`);
      // Optional: Send a stop command if your firmware uses it
      // sendMessage({ action: 'control', componentGroup: 'steppers', id, command: 'stop' });
    }

    // Cleanup interval on unmount
    return () => {
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
        moveIntervalRef.current = null;
      }
    };
  }, [isMovingLeft, isMovingRight, id, sendMessage]); // Rerun if moving state changes

  const moveToPosition = (pos: number) => {
    let limitedPos = Math.round(pos); // Ensure integer steps
    if (limitedPos < minPosition) limitedPos = minPosition;
    if (limitedPos > maxPosition) limitedPos = maxPosition;

    console.log(`[StepperCard ${id}] Sending move to: ${limitedPos} steps`);
    sendMessage({
      action: "control",
      componentGroup: "steppers",
      id: id,
      command: "move",
      value: limitedPos,
    });
  };

  const moveToHome = () => {
    console.log(`[StepperCard ${id}] Sending home command`);
    sendMessage({
      action: "control",
      componentGroup: "steppers",
      id: id,
      command: "home",
    });
  };

  const moveSteps = (steps: number) => {
    console.log(`[StepperCard ${id}] Sending step command: ${steps}`);
    sendMessage({
      action: "control",
      componentGroup: "steppers",
      id: id,
      command: "step",
      value: steps,
    });
  };

  // Function to send speed/acceleration updates
  const sendSpeedAccelUpdate = () => {
    console.log(
      `[StepperCard ${id}] Sending speed/accel update: Speed=${speed}, Accel=${acceleration}`
    );
    sendMessage({
      action: "control",
      componentGroup: "steppers",
      id: id,
      command: "setParams",
      speed: speed,
      acceleration: acceleration,
    });
  };

  // Update speed/accel state and send update to device, also notify dashboard
  const handleSpeedChangeCommit = (newSpeedValue: number) => {
    // setSpeed is already called by onValueChange for slider UI responsiveness
    sendSpeedAccelUpdate(); // Sends to device with current speed state
    if (onSettingsChange) {
      onSettingsChange(id, { speed: newSpeedValue }); // Updates dashboard config
    }
  };

  const handleAccelChangeCommit = (newAccelValue: number) => {
    // setAcceleration is already called by onValueChange for slider UI responsiveness
    sendSpeedAccelUpdate(); // Sends to device with current acceleration state
    if (onSettingsChange) {
      onSettingsChange(id, { acceleration: newAccelValue }); // Updates dashboard config
    }
  };

  const handleJog = (direction: "left" | "right") => {
    let stepsToMove = 0;
    if (jogUnit === "steps") {
      stepsToMove = direction === "left" ? -jogAmount : jogAmount;
    } else {
      stepsToMove = Math.round(
        (direction === "left" ? -jogAmountInches : jogAmountInches) *
          stepsPerInch
      );
    }
    moveSteps(stepsToMove); // Use the moveSteps function
  };

  // Calculate position as percentage for visual indicator using the prop
  const positionPercentage =
    maxPosition !== minPosition
      ? ((position - minPosition) / (maxPosition - minPosition)) * 100
      : 50; // Avoid division by zero, show in middle if min === max

  // --- Go To Position Handler --- //
  const handleGoToPosition = () => {
    const numericValue = parseFloat(targetMoveValue);
    if (isNaN(numericValue)) {
      console.error("Invalid target position input");
      // TODO: Add user feedback (e.g., toast)
      return;
    }

    let targetPos = 0;
    if (moveToUnit === "steps") {
      targetPos = numericValue;
    } else {
      // Unit is inches
      targetPos = Math.round(numericValue * stepsPerInch);
    }

    console.log(
      `[StepperCard ${id}] Moving to ${targetPos} steps (${numericValue} ${moveToUnit})`
    );
    moveToPosition(targetPos);
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <CardTitle className="flex items-center">
              {name}
              <Badge variant="outline" className="ml-2">
                {(position / stepsPerInch).toFixed(2)}"
              </Badge>
            </CardTitle>
            <div className="flex mt-1 text-xs text-muted-foreground">
              <Badge variant="outline" className="mr-1">
                Step: {pins.step}
              </Badge>
              <Badge variant="outline" className="mr-1">
                Dir: {pins.direction}
              </Badge>
              {pins.enable && (
                <Badge variant="outline">En: {pins.enable}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={moveToHome}
              title="Home"
            >
              <Home className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditPins}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Pins
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-red-500 focus:text-red-500"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-primary transition-all duration-100 ease-linear rounded-full"
            style={{ width: `${positionPercentage}%` }}
          />
        </div>

        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>{(minPosition / stepsPerInch).toFixed(3)}"</span>
          <span className="font-medium text-primary">
            {position.toLocaleString()} steps (
            {(position / stepsPerInch).toFixed(3)}")
          </span>
          <span>{(maxPosition / stepsPerInch).toFixed(3)}"</span>
        </div>

        <div className="flex space-x-2 items-center text-xs text-gray-500">
          <span>Range:</span>
          <span>{(maxPosition - minPosition).toLocaleString()} steps</span>
          <span>|</span>
          <span>
            {((maxPosition - minPosition) / stepsPerInch).toFixed(3)}"
          </span>
        </div>

        {/* Hold Buttons */}
        <div className="flex space-x-2">
          <Button
            variant="outline"
            className="flex-1 flex items-center justify-center"
            onMouseDown={() => setIsMovingLeft(true)}
            onMouseUp={() => setIsMovingLeft(false)}
            onMouseLeave={() => setIsMovingLeft(false)} // Stop if mouse leaves button while pressed
            onTouchStart={(e) => {
              e.preventDefault();
              setIsMovingLeft(true);
            }} // Prevent scrolling on touch
            onTouchEnd={() => setIsMovingLeft(false)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Hold Left
          </Button>
          <Button
            variant="outline"
            className="flex-1 flex items-center justify-center"
            onMouseDown={() => setIsMovingRight(true)}
            onMouseUp={() => setIsMovingRight(false)}
            onMouseLeave={() => setIsMovingRight(false)}
            onTouchStart={(e) => {
              e.preventDefault();
              setIsMovingRight(true);
            }}
            onTouchEnd={() => setIsMovingRight(false)}
          >
            Hold Right
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Jog Buttons */}
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => handleJog("left")}
          >
            Jog{" "}
            {jogUnit === "steps"
              ? `-${jogAmount.toLocaleString()}`
              : `-${jogAmountInches}"`}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => handleJog("right")}
          >
            Jog{" "}
            {jogUnit === "steps"
              ? `+${jogAmount.toLocaleString()}`
              : `+${jogAmountInches}"`}
          </Button>
        </div>

        <Tabs defaultValue="movement">
          <TabsList className="grid grid-cols-3 mb-2">
            <TabsTrigger value="movement" className="text-xs">
              <MoveHorizontal className="h-3 w-3 mr-1" />
              Movement
            </TabsTrigger>
            <TabsTrigger value="speed" className="text-xs">
              <Gauge className="h-3 w-3 mr-1" />
              Speed
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="h-3 w-3 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="movement" className="space-y-3">
            <div>
              <Label htmlFor={`${id}-target-move`}>Move to Position</Label>
              <div className="flex space-x-2 mt-1">
                <Input
                  id={`${id}-target-move`}
                  type="number"
                  value={targetMoveValue}
                  onChange={(e) => setTargetMoveValue(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGoToPosition();
                  }}
                />
                <Select
                  value={moveToUnit}
                  onValueChange={(value: "steps" | "inches") =>
                    setMoveToUnit(value)
                  }
                >
                  <SelectTrigger className="w-[80px]">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="steps">steps</SelectItem>
                    <SelectItem value="inches">inches</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleGoToPosition}>Go</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="speed" className="space-y-3">
            <div>
              <div className="flex justify-between">
                <Label htmlFor={`${id}-speed`}>Speed (steps/sec)</Label>
                <span className="text-sm font-medium">{speed}</span>
              </div>
              <Slider
                id={`${id}-speed`}
                value={[speed]}
                min={100}
                max={100000}
                step={100}
                onValueChange={(value) => setSpeed(value[0])} // Live update for slider UI
                onValueCommit={(value) => handleSpeedChangeCommit(value[0])} // Corrected: Use new handler name
                className="mt-2"
              />
            </div>
            <div>
              <div className="flex justify-between">
                <Label htmlFor={`${id}-accel`}>Acceleration (steps/sec²)</Label>
                <span className="text-sm font-medium">{acceleration}</span>
              </div>
              <Slider
                id={`${id}-accel`}
                value={[acceleration]}
                min={100}
                max={50000}
                step={100}
                onValueChange={(value) => setAcceleration(value[0])} // Live update for slider UI
                onValueCommit={(value) => handleAccelChangeCommit(value[0])} // Corrected: Use new handler name
                className="mt-2"
              />
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            <div>
              <Label htmlFor={`${id}-steps-per-inch`}>Steps per Inch</Label>
              <div className="flex space-x-2">
                <Input
                  id={`${id}-steps-per-inch`}
                  type="text"
                  value={stepsPerInchInput}
                  onChange={(e) => {
                    const valStr = e.target.value;
                    setStepsPerInchInput(valStr);
                    if (valStr === "") return; // Allow clearing, numeric state holds last valid
                    const numericSPI = Number(valStr);
                    if (!isNaN(numericSPI)) {
                      setStepsPerInch(numericSPI);
                      if (onSettingsChange) {
                        onSettingsChange(id, { stepsPerInch: numericSPI });
                      }
                    }
                  }}
                  className="mt-1 flex-1"
                  placeholder="e.g. 2000"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`${id}-min-pos`}>
                  Minimum Position (Steps)
                </Label>
                <div className="flex space-x-2">
                  <Input
                    id={`${id}-min-pos`}
                    type="text"
                    value={minPositionInput}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      setMinPositionInput(valStr);
                      if (valStr === "") return;
                      const numVal = Number(valStr);
                      if (!isNaN(numVal)) {
                        // Add validation if needed, e.g. numVal < maxPosition
                        setMinPosition(numVal);
                        if (onSettingsChange) {
                          onSettingsChange(id, { minPosition: numVal });
                        }
                      }
                    }}
                    className="mt-1 flex-1"
                    placeholder="Min steps"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor={`${id}-max-pos`}>
                  Maximum Position (Steps)
                </Label>
                <div className="flex space-x-2">
                  <Input
                    id={`${id}-max-pos`}
                    type="text"
                    value={maxPositionInput}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      setMaxPositionInput(valStr);
                      if (valStr === "") return;
                      const numVal = Number(valStr);
                      if (!isNaN(numVal)) {
                        // Add validation if needed, e.g. numVal > minPosition
                        setMaxPosition(numVal);
                        if (onSettingsChange) {
                          onSettingsChange(id, { maxPosition: numVal });
                        }
                      }
                    }}
                    className="mt-1 flex-1"
                    placeholder="Max steps"
                  />
                </div>
              </div>
            </div>
            <div className="border rounded-md p-3 space-y-3">
              <Label className="font-medium">Jog Button Settings</Label>
              <div>
                <Label htmlFor={`${id}-jog-unit`}>Jog Units</Label>
                <Select
                  value={jogUnit}
                  onValueChange={(value: "steps" | "inches") => {
                    setJogUnit(value);
                    if (onSettingsChange) {
                      onSettingsChange(id, { jogUnit: value });
                    }
                  }}
                >
                  <SelectTrigger id={`${id}-jog-unit`} className="mt-1">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="steps">Steps</SelectItem>
                    <SelectItem value="inches">Inches</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {jogUnit === "steps" ? (
                <div>
                  <Label htmlFor={`${id}-jog-amount`}>Jog Amount (steps)</Label>
                  <Input
                    id={`${id}-jog-amount`}
                    type="text"
                    value={jogAmountInput}
                    onChange={(e) => {
                      setJogAmountInput(e.target.value);
                      const numVal = Number(e.target.value);
                      if (!isNaN(numVal)) {
                        setJogAmount(numVal);
                        if (onSettingsChange) {
                          onSettingsChange(id, { jogAmount: numVal });
                        }
                      } else if (e.target.value === "") {
                        // If input is cleared, decide what jogAmount (number) should be.
                        // For now, it remains unchanged, or you could set setJogAmount(0) or similar.
                      }
                    }}
                    className="mt-1"
                    placeholder="e.g. 200"
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor={`${id}-jog-amount-inches`}>
                    Jog Amount (inches)
                  </Label>
                  <Input
                    id={`${id}-jog-amount-inches`}
                    type="text"
                    value={jogAmountInchesInput}
                    onChange={(e) => {
                      setJogAmountInchesInput(e.target.value);
                      const numVal = parseFloat(e.target.value);
                      if (!isNaN(numVal)) {
                        setJogAmountInches(numVal);
                        if (onSettingsChange) {
                          onSettingsChange(id, { jogAmountInches: numVal });
                        }
                      } else if (e.target.value === "") {
                        // If input is cleared, decide what jogAmountInches (number) should be.
                      }
                    }}
                    step="0.1"
                    className="mt-1"
                    placeholder="e.g. 0.1"
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
