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
}: StepperCardProps) {
  // Settings State (can be adjusted by user)
  const [speed, setSpeed] = useState(initialSpeed);
  const [acceleration, setAcceleration] = useState(initialAcceleration);
  const [stepsPerInch, setStepsPerInch] = useState(initialStepsPerInch);
  const [minPosition, setMinPosition] = useState(initialMinPosition);
  const [maxPosition, setMaxPosition] = useState(initialMaxPosition);

  // Target State (Updated for combined input)
  const [targetMoveValue, setTargetMoveValue] = useState<string>("0"); // Store input as string
  const [moveToUnit, setMoveToUnit] = useState<"steps" | "inches">("steps"); // State for unit selection

  // Jogging State (UI only)
  const [jogUnit, setJogUnit] = useState<"steps" | "inches">("steps");
  const [jogAmount, setJogAmount] = useState(200);
  const [jogAmountInches, setJogAmountInches] = useState(0.1);

  // Continuous Movement State
  const [isMovingLeft, setIsMovingLeft] = useState(false);
  const [isMovingRight, setIsMovingRight] = useState(false);
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to hold interval ID

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

  // Update speed/accel state and send update
  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    sendSpeedAccelUpdate();
  };

  const handleAccelChange = (newAccel: number) => {
    setAcceleration(newAccel);
    sendSpeedAccelUpdate();
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

    if (moveToUnit === "steps") {
      moveToPosition(numericValue);
    } else {
      // Unit is inches
      const steps = numericValue * stepsPerInch;
      moveToPosition(steps);
    }
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
          <span>{(minPosition / stepsPerInch).toFixed(2)}"</span>
          <span className="font-medium text-primary">
            {position} steps ({(position / stepsPerInch).toFixed(2)}")
          </span>
          <span>{(maxPosition / stepsPerInch).toFixed(2)}"</span>
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
                max={10000}
                step={100}
                onValueChange={(value) => setSpeed(value[0])} // Update local state for slider smoothness
                onValueCommit={(value) => handleSpeedChange(value[0])} // Send command on release
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
                max={5000}
                step={100}
                onValueChange={(value) => setAcceleration(value[0])} // Update local state
                onValueCommit={(value) => handleAccelChange(value[0])} // Send command on release
                className="mt-2"
              />
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            <div>
              <Label htmlFor={`${id}-steps-per-inch`}>Steps per Inch</Label>
              <Input
                id={`${id}-steps-per-inch`}
                type="number"
                value={stepsPerInch}
                onChange={(e) => setStepsPerInch(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`${id}-min-pos`}>
                  Minimum Position (Steps)
                </Label>
                <Input
                  id={`${id}-min-pos`}
                  type="number"
                  value={minPosition}
                  onChange={(e) => setMinPosition(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`${id}-max-pos`}>
                  Maximum Position (Steps)
                </Label>
                <Input
                  id={`${id}-max-pos`}
                  type="number"
                  value={maxPosition}
                  onChange={(e) => setMaxPosition(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="border rounded-md p-3 space-y-3">
              <Label className="font-medium">Jog Button Settings</Label>
              <div>
                <Label htmlFor={`${id}-jog-unit`}>Jog Units</Label>
                <Select
                  value={jogUnit}
                  onValueChange={(value: "steps" | "inches") =>
                    setJogUnit(value)
                  }
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
                    type="number"
                    value={jogAmount}
                    onChange={(e) => setJogAmount(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor={`${id}-jog-amount-inches`}>
                    Jog Amount (inches)
                  </Label>
                  <Input
                    id={`${id}-jog-amount-inches`}
                    type="number"
                    value={jogAmountInches}
                    onChange={(e) => setJogAmountInches(Number(e.target.value))}
                    step="0.1"
                    className="mt-1"
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
