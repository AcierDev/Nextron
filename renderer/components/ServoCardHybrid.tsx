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
}: ServoCardProps) {
  // Removed internal angle state: const [angle, setAngle] = useState(initialAngle);
  const [minAngle, setMinAngle] = useState(initialMinAngle);
  const [maxAngle, setMaxAngle] = useState(initialMaxAngle);
  const [targetAngle, setTargetAngle] = useState(90); // UI state for the input field

  // Load presets from localStorage if available, else use defaults
  const [presets, setPresets] = useState<number[]>(() => {
    // Try to load saved presets for this specific servo
    try {
      const savedPresets = localStorage.getItem(`servo-presets-${id}`);
      if (savedPresets) {
        return JSON.parse(savedPresets);
      }
    } catch (error) {
      console.error("Error loading saved presets:", error);
    }
    // Default presets if none saved
    return [0, 45, 90, 135, 180];
  });
  const [newPreset, setNewPreset] = useState(0);
  const [editingPreset, setEditingPreset] = useState<{
    index: number;
    value: number;
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
    ctx.fillRect(centerX - 20, centerY - 10, 40, 20);

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
    let limitedAngle = newAngle;
    if (limitedAngle < minAngle) limitedAngle = minAngle;
    if (limitedAngle > maxAngle) limitedAngle = maxAngle;

    console.log(`[ServoCard ${id}] Sending setAngle: ${limitedAngle}`);

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
    if (
      newPreset >= minAngle &&
      newPreset <= maxAngle &&
      !presets.includes(newPreset)
    ) {
      setPresets([...presets, newPreset].sort((a, b) => a - b));
      setNewPreset(0);
    }
  };

  const removePreset = (presetToRemove: number) => {
    setPresets(presets.filter((preset) => preset !== presetToRemove));
  };

  const updatePreset = () => {
    if (
      editingPreset &&
      editingPreset.value >= minAngle &&
      editingPreset.value <= maxAngle
    ) {
      const newPresets = [...presets];
      newPresets[editingPreset.index] = editingPreset.value;
      setPresets(newPresets.sort((a, b) => a - b));
      setEditingPreset(null);
    }
  };

  // Function to handle changes to min/max angle limits (local state only for now)
  // To make persistent, these would need to trigger an update in hardwareConfig
  // and potentially send a new configure message via sendMessage
  const handleMinAngleChange = (value: number) => {
    const newMin = Math.max(0, Math.min(value, maxAngle - 1)); // Ensure min < max and >= 0
    setMinAngle(newMin);

    // Send update to the server
    sendMessage({
      action: "configure",
      componentGroup: "servos",
      config: {
        id,
        name,
        pin: pins.control,
        minAngle: newMin,
        maxAngle,
      },
    });
  };

  const handleMaxAngleChange = (value: number) => {
    const newMax = Math.min(180, Math.max(value, minAngle + 1)); // Ensure max > min and <= 180
    setMaxAngle(newMax);

    // Send update to the server
    sendMessage({
      action: "configure",
      componentGroup: "servos",
      config: {
        id,
        name,
        pin: pins.control,
        minAngle,
        maxAngle: newMax,
      },
    });
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
  }, [initialMinAngle, initialMaxAngle]);

  // Save presets to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(`servo-presets-${id}`, JSON.stringify(presets));
    } catch (error) {
      console.error("Error saving presets:", error);
    }
  }, [presets, id]);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <CardTitle className="flex items-center">
              {name}
              <Badge variant="outline" className="ml-2">
                {angle}°
              </Badge>
            </CardTitle>
            <div className="flex mt-1 text-xs text-muted-foreground">
              <Badge variant="outline">Control Pin: {pins.control}</Badge>
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
                  type="number"
                  value={targetAngle}
                  onChange={(e) => setTargetAngle(Number(e.target.value))}
                  min={minAngle}
                  max={maxAngle}
                />
                <Button onClick={() => moveToAngle(targetAngle)}>Go</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`${id}-min-angle`}>Minimum Angle</Label>
                <Input
                  id={`${id}-min-angle`}
                  type="number"
                  value={minAngle}
                  onChange={(e) => handleMinAngleChange(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`${id}-max-angle`}>Maximum Angle</Label>
                <Input
                  id={`${id}-max-angle`}
                  type="number"
                  value={maxAngle}
                  onChange={(e) => handleMaxAngleChange(Number(e.target.value))}
                  className="mt-1"
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
                              type="number"
                              value={editingPreset?.value ?? preset}
                              onChange={(e) =>
                                setEditingPreset({
                                  index,
                                  value: Number(e.target.value),
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
                  type="number"
                  value={newPreset}
                  onChange={(e) => setNewPreset(Number(e.target.value))}
                  min={minAngle}
                  max={maxAngle}
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
