"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Home,
  Settings,
  Gauge,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Edit,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Define WebSocket message sending function type
type SendMessage = (message: object) => void;

interface ServoCardProps {
  id: string;
  name: string;
  angle: number; // Live angle from dashboard state
  minAngle: number;
  maxAngle: number;
  pins: {
    control: number;
  };
  onDelete: () => void;
  onDuplicate: () => void;
  onEditPins: () => void;
  sendMessage: SendMessage; // Added sendMessage prop
  initialPresets?: number[];
  initialSpeed?: number; // Add initial speed
  onSettingsChange?: (
    id: string,
    newSettings: {
      presets?: number[];
      minAngle?: number;
      maxAngle?: number;
      speed?: number; // Add speed to settings
    }
  ) => void;
}

export default function ServoCardHybrid({
  id,
  name,
  angle, // Use passed-in angle directly
  minAngle: initialMinAngle,
  maxAngle: initialMaxAngle,
  pins,
  onDelete,
  onDuplicate,
  onEditPins,
  sendMessage, // Destructure sendMessage
  initialPresets,
  initialSpeed = 100, // Default to maximum speed
  onSettingsChange,
}: ServoCardProps) {
  // Removed internal angle state: const [angle, setAngle] = useState(initialAngle);
  const [minAngle, setMinAngle] = useState(initialMinAngle);
  const [maxAngle, setMaxAngle] = useState(initialMaxAngle);
  const [targetAngleInput, setTargetAngleInput] = useState<string>("90"); // UI state for the input field, now string
  const [speed, setSpeed] = useState<number>(initialSpeed); // Add speed state

  // States for string representation of min/max angle inputs
  const [minAngleInput, setMinAngleInput] = useState<string>(
    initialMinAngle.toString()
  );
  const [maxAngleInput, setMaxAngleInput] = useState<string>(
    initialMaxAngle.toString()
  );

  // Load presets from localStorage if available, else use defaults
  const [presets, setPresets] = useState<number[]>(
    initialPresets ?? [0, 45, 90, 135, 180]
  );
  const [newPresetInput, setNewPresetInput] = useState<string>("0"); // For the input field
  const [editingPreset, setEditingPreset] = useState<{
    index: number;
    value: string; // Store edit value as string
  } | null>(null);

  // For canvas visualization
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height - 20;
    const radius = Math.min(width, height * 2) / 2 - 10;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw servo body
    ctx.fillStyle = "#e5e7eb"; // Tailwind gray-200
    ctx.fillRect(centerX - 20, centerY, 40, 2);

    // Draw angle arc based on minAngle and maxAngle
    ctx.beginPath();
    const startAngleRad = ((180 + minAngle) * Math.PI) / 180;
    const endAngleRad = ((180 + maxAngle) * Math.PI) / 180;
    ctx.arc(centerX, centerY, radius, startAngleRad, endAngleRad, false); // false for clockwise
    ctx.strokeStyle = "#d1d5db"; // Tailwind gray-300
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw min/max angle markers
    const minAngleRad = ((180 - minAngle) * Math.PI) / 180;
    const maxAngleRad = ((180 - maxAngle) * Math.PI) / 180;

    // Min angle marker
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + radius * Math.cos(minAngleRad),
      centerY - radius * Math.sin(minAngleRad)
    );
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Max angle marker
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + radius * Math.cos(maxAngleRad),
      centerY - radius * Math.sin(maxAngleRad)
    );
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw preset angle markers
    presets.forEach((preset) => {
      if (preset >= minAngle && preset <= maxAngle) {
        const presetRad = ((180 - preset) * Math.PI) / 180;

        // Draw a small dot at the preset position
        ctx.beginPath();
        ctx.arc(
          centerX + (radius - 5) * Math.cos(presetRad),
          centerY - (radius - 5) * Math.sin(presetRad),
          3,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "#9ca3af";
        ctx.fill();
      }
    });

    // Draw current angle arm
    const angleRad = ((180 - angle) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + radius * Math.cos(angleRad),
      centerY - radius * Math.sin(angleRad)
    );
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw angle indicator at the end of the arm
    ctx.beginPath();
    ctx.arc(
      centerX + radius * Math.cos(angleRad),
      centerY - radius * Math.sin(angleRad),
      5,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "#4f46e5";
    ctx.fill();
  }, [angle, minAngle, maxAngle, presets]);

  const moveToAngle = (newAngle: number) => {
    // Apply limits locally for immediate UI feedback
    const limitedAngle = Math.min(Math.max(newAngle, minAngle), maxAngle);

    console.log(
      `[ServoCard ${id}] Sending setAngle: ${limitedAngle}, speed: ${speed}`
    );

    // Check if the servo is attached and show error if not
    try {
      sendMessage({
        action: "control",
        componentGroup: "servos",
        id: id,
        command: "setAngle", // Using the command name we added to the firmware
        value: limitedAngle,
      });
    } catch (error) {
      console.error(`[ServoCard ${id}] Error sending angle command:`, error);
    }
    // Angle state will be updated from parent via the angle prop when the server responds
  };

  const moveToHome = () => {
    moveToAngle(90); // Send command to move to 90 degrees
  };

  const addPreset = () => {
    const numericPreset = parseInt(newPresetInput, 10);
    if (
      !isNaN(numericPreset) &&
      numericPreset >= minAngle &&
      numericPreset <= maxAngle &&
      !presets.includes(numericPreset)
    ) {
      const updatedPresets = [...presets, numericPreset].sort((a, b) => a - b);
      setPresets(updatedPresets);
      if (onSettingsChange) {
        onSettingsChange(id, { presets: updatedPresets });
      }
      setNewPresetInput("0"); // Reset input
    }
  };

  const removePreset = (presetToRemove: number) => {
    const updatedPresets = presets.filter(
      (preset) => preset !== presetToRemove
    );
    setPresets(updatedPresets);
    if (onSettingsChange) {
      onSettingsChange(id, { presets: updatedPresets });
    }
  };

  const updatePreset = () => {
    if (editingPreset) {
      const numericValue = parseInt(editingPreset.value, 10);
      if (
        !isNaN(numericValue) &&
        numericValue >= minAngle &&
        numericValue <= maxAngle
      ) {
        const newPresetsArray = [...presets];
        newPresetsArray[editingPreset.index] = numericValue;
        newPresetsArray.sort((a, b) => a - b);
        setPresets(newPresetsArray);
        if (onSettingsChange) {
          onSettingsChange(id, { presets: newPresetsArray });
        }
        setEditingPreset(null);
      }
    }
  };

  // Function to handle changes to min/max angle limits (local state only for now)
  // To make persistent, these would need to trigger an update in hardwareConfig
  // and potentially send a new configure message via sendMessage
  const handleMinAngleInputChange = (valueStr: string) => {
    setMinAngleInput(valueStr);
    const newMin = parseInt(valueStr, 10);
    if (!isNaN(newMin)) {
      const validatedMin = Math.max(0, Math.min(newMin, maxAngle - 1)); // Ensure min < max and >= 0
      setMinAngle(validatedMin);

      // Send update to the server
      sendMessage({
        action: "configure",
        componentGroup: "servos",
        config: {
          id,
          name,
          pin: pins.control,
          minAngle: validatedMin,
          maxAngle,
        },
      });
      if (onSettingsChange) {
        onSettingsChange(id, { minAngle: validatedMin });
      }
    }
  };

  const handleMaxAngleInputChange = (valueStr: string) => {
    setMaxAngleInput(valueStr);
    const newMax = parseInt(valueStr, 10);
    if (!isNaN(newMax)) {
      const validatedMax = Math.min(180, Math.max(newMax, minAngle + 1)); // Ensure max > min and <= 180
      setMaxAngle(validatedMax);

      // Send update to the server
      sendMessage({
        action: "configure",
        componentGroup: "servos",
        config: {
          id,
          name,
          pin: pins.control,
          minAngle,
          maxAngle: validatedMax,
        },
      });
      if (onSettingsChange) {
        onSettingsChange(id, { maxAngle: validatedMax });
      }
    }
  };

  // Add function to update servo speed
  const updateSpeed = (newSpeed: number) => {
    // Validate and constrain speed
    const validSpeed = Math.max(1, Math.min(100, newSpeed));
    setSpeed(validSpeed);

    console.log(`[ServoCard ${id}] Setting speed: ${validSpeed}`);

    try {
      // Send immediate control message to update the current speed
      // This affects the servo's behavior right away
      sendMessage({
        action: "control",
        componentGroup: "servos",
        id: id,
        speed: validSpeed,
      });

      // Update persistent settings in the parent component
      // This ensures the speed is saved when the configuration is saved
      if (onSettingsChange) {
        onSettingsChange(id, { speed: validSpeed });
      }
    } catch (error) {
      console.error(`[ServoCard ${id}] Error sending speed command:`, error);
    }
  };

  // Add an effect to listen for WebSocket events
  useEffect(() => {
    // Define a handler for the WebSocket message event
    const handleMessage = (event: CustomEvent<any>) => {
      try {
        const data = event.detail;

        // Check if this message is for this servo
        if (data && data.id === id) {
          console.log(`[ServoCard ${id}] Received message:`, data);

          // Handle any specific updates needed
          if (data.status === "ERROR" && data.message) {
            console.error(`[ServoCard ${id}] Error:`, data.message);
          }
        }
      } catch (error) {
        console.error("[ServoCard] Error processing WebSocket message:", error);
      }
    };

    // Add event listener for custom websocket messages
    window.addEventListener(
      "websocket-message",
      handleMessage as EventListener
    );

    // Cleanup
    return () => {
      window.removeEventListener(
        "websocket-message",
        handleMessage as EventListener
      );
    };
  }, [id]);

  // Add useEffect to update state when props change
  useEffect(() => {
    setMinAngle(initialMinAngle);
    setMaxAngle(initialMaxAngle);
    setMinAngleInput(initialMinAngle.toString());
    setMaxAngleInput(initialMaxAngle.toString());
  }, [initialMinAngle, initialMaxAngle]);

  // Update string inputs if numeric states change (e.g. due to validation logic)
  useEffect(() => {
    setMinAngleInput(minAngle.toString());
  }, [minAngle]);

  useEffect(() => {
    setMaxAngleInput(maxAngle.toString());
  }, [maxAngle]);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center">
            {name}{" "}
            <div className="flex mt-1 pl-2 text-xs text-muted-foreground">
              <Badge variant="outline">Control Pin: {pins.control}</Badge>
            </div>
          </CardTitle>
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
        <div className="h-32">
          <canvas
            ref={canvasRef}
            width={200}
            height={120}
            className="w-full h-full"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <Label htmlFor={`${id}-angle-slider`}>Angle</Label>
            <span className="text-sm font-medium">{angle}°</span>
          </div>
          <Slider
            id={`${id}-angle-slider`}
            value={[angle]}
            min={minAngle}
            max={maxAngle}
            step={1}
            onValueChange={(value) => moveToAngle(value[0])}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{minAngle}°</span>
            <span>{maxAngle}°</span>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Presets</Label>
          <div className="flex flex-wrap gap-2">
            {presets
              .filter((p) => p >= minAngle && p <= maxAngle)
              .map((preset) => (
                <Button
                  key={preset}
                  variant={angle === preset ? "default" : "outline"}
                  size="sm"
                  onClick={() => moveToAngle(preset)}
                  className="flex-1"
                >
                  {preset}°
                </Button>
              ))}
          </div>
        </div>

        <Tabs defaultValue="control">
          <TabsList className="grid grid-cols-2 mb-2">
            <TabsTrigger value="control" className="text-xs">
              <Gauge className="h-3 w-3 mr-1" />
              Control
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="h-3 w-3 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="space-y-3">
            <div>
              <Label htmlFor={`${id}-target-angle`}>Set Exact Angle</Label>
              <div className="flex space-x-2 mt-1">
                <Input
                  id={`${id}-target-angle`}
                  type="text" // Use text to allow empty string
                  value={targetAngleInput}
                  onChange={(e) => setTargetAngleInput(e.target.value)}
                  placeholder="Angle"
                />
                <Button
                  onClick={() => {
                    const numericAngle = parseInt(targetAngleInput, 10);
                    if (!isNaN(numericAngle)) {
                      moveToAngle(numericAngle);
                    }
                  }}
                >
                  Go
                </Button>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <Label htmlFor={`${id}-speed-slider`}>Movement Speed</Label>
                <span className="text-sm font-medium">{speed}%</span>
              </div>
              <Slider
                id={`${id}-speed-slider`}
                value={[speed]}
                min={1}
                max={100}
                step={1}
                onValueChange={(value) => updateSpeed(value[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Slow</span>
                <span>Fast</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`${id}-min-angle`}>Minimum Angle</Label>
                <Input
                  id={`${id}-min-angle`}
                  type="text" // Use text to allow empty string
                  value={minAngleInput}
                  onChange={(e) => handleMinAngleInputChange(e.target.value)}
                  className="mt-1"
                  placeholder="Min"
                />
              </div>
              <div>
                <Label htmlFor={`${id}-max-angle`}>Maximum Angle</Label>
                <Input
                  id={`${id}-max-angle`}
                  type="text" // Use text to allow empty string
                  value={maxAngleInput}
                  onChange={(e) => handleMaxAngleInputChange(e.target.value)}
                  className="mt-1"
                  placeholder="Max"
                />
              </div>
            </div>

            <div className="border rounded-md p-3 space-y-3">
              <Label className="font-medium">Preset Angles</Label>

              <div className="flex flex-wrap gap-2">
                {presets.map((preset, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      {preset}°
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Edit Preset</DialogTitle>
                          </DialogHeader>
                          <div className="py-4">
                            <Label htmlFor="edit-preset" className="mb-2 block">
                              Preset Angle
                            </Label>
                            <Input
                              id="edit-preset"
                              type="number" // Keeping as number for native browser handling if preferred, or change to text
                              value={editingPreset?.value ?? preset.toString()} // preset is number, so toString()
                              onChange={(e) =>
                                editingPreset &&
                                setEditingPreset({
                                  ...editingPreset,
                                  value: e.target.value, // Store raw string
                                })
                              }
                              min={minAngle}
                              max={maxAngle}
                            />
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button onClick={updatePreset}>Save</Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0"
                        onClick={() => removePreset(preset)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <Input
                  type="text" // Use text to allow empty string
                  value={newPresetInput}
                  onChange={(e) => setNewPresetInput(e.target.value)}
                  placeholder="New preset angle"
                />
                <Button variant="outline" size="icon" onClick={addPreset}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
