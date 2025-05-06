"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  Gauge,
  Zap,
  Activity,
  ToggleLeft,
  Sliders,
  Trash2,
  Copy,
  Edit,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Clock,
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
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";

interface IOPinCardProps {
  id: string;
  name: string;
  pinNumber: number;
  mode: "input" | "output";
  type: "digital" | "analog" | "pwm";
  value: number;
  onDelete: () => void;
  onDuplicate: () => void;
  onEditPin: () => void;
  sendMessage?: (message: object) => boolean;
}

export default function IOPinCard({
  id,
  name,
  pinNumber,
  mode,
  type,
  value: initialValue,
  onDelete,
  onDuplicate,
  onEditPin,
  sendMessage,
}: IOPinCardProps) {
  const [value, setValue] = useState(initialValue);
  const [autoRefresh, setAutoRefresh] = useState(false); // Default to false since we now use events
  const [pullMode, setPullMode] = useState<number>(0); // 0: none, 1: pullup, 2: pulldown
  const [debounceMs, setDebounceMs] = useState<number>(50); // Default 50 = mild debouncing
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Flag to track if we need to update our pin configuration
  const [isPinConfigChanged, setIsPinConfigChanged] = useState(false);

  // Send pin configuration update when pull mode or debounce settings change
  useEffect(() => {
    if (isPinConfigChanged && sendMessage) {
      sendMessage({
        action: "configure",
        componentGroup: "pins",
        config: {
          id,
          name,
          pin: pinNumber,
          mode,
          pinType: type,
          pullMode,
          debounceMs,
        },
      });
      setIsPinConfigChanged(false);
    }
  }, [
    isPinConfigChanged,
    id,
    name,
    pinNumber,
    mode,
    type,
    pullMode,
    debounceMs,
    sendMessage,
  ]);

  // Listen for WebSocket messages from the parent component
  useEffect(() => {
    // Define a handler for the WebSocket message event
    const handleMessage = (event: CustomEvent<any>) => {
      try {
        const data = event.detail;

        // Check if this message is for this pin
        if (data && data.id === id) {
          if (data.value !== undefined) {
            setValue(data.value);
            setLastUpdate(new Date());
          }

          if (data.status === "ERROR" && data.message) {
            setStatusMessage(data.message);
            // Clear error message after 3 seconds
            setTimeout(() => setStatusMessage(null), 3000);
          }
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
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

  // Only use auto refresh for analog inputs that might need polling
  // as digital inputs are now event-driven
  useEffect(() => {
    if (mode !== "input" || !autoRefresh || !sendMessage || type !== "analog")
      return;

    const interval = setInterval(() => {
      // Request pin value from the device
      sendMessage({
        action: "readPin",
        componentGroup: "pins",
        id: id,
        pin: pinNumber,
      });
    }, 1000); // Fixed interval for analog polling

    return () => clearInterval(interval);
  }, [mode, autoRefresh, id, pinNumber, sendMessage, type]);

  // Handle manual refresh for input pins
  const handleRefresh = () => {
    if (mode !== "input" || !sendMessage) return;

    // Send a message to request the current pin value
    sendMessage({
      action: "readPin",
      componentGroup: "pins",
      id: id,
      pin: pinNumber,
    });

    setLastUpdate(new Date());
  };

  // Handle value change for output pins
  const handleValueChange = (newValue: number) => {
    if (mode !== "output" || !sendMessage) return;

    setValue(newValue);

    // Send the new value to the device
    sendMessage({
      action: "writePin",
      componentGroup: "pins",
      id: id,
      pin: pinNumber,
      value: newValue,
      type: type,
    });
  };

  // Toggle digital output
  const toggleDigitalOutput = () => {
    if (mode !== "output" || type !== "digital" || !sendMessage) return;
    const newValue = value === 0 ? 1 : 0;
    setValue(newValue);

    // Send the new value to the device
    sendMessage({
      action: "writePin",
      componentGroup: "pins",
      id: id,
      pin: pinNumber,
      value: newValue,
      type: "digital",
    });
  };

  // Handle pull mode change
  const handlePullModeChange = (value: string) => {
    const newPullMode = parseInt(value, 10);
    setPullMode(newPullMode);
    setIsPinConfigChanged(true);
  };

  // Handle debounce setting change
  const handleDebounceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    setDebounceMs(isNaN(newValue) ? 0 : newValue);
    setIsPinConfigChanged(true);
  };

  // Format value display based on pin type
  const getValueDisplay = () => {
    if (type === "digital") {
      return value === 1 ? "HIGH" : "LOW";
    } else if (type === "analog") {
      return `${value} (${Math.round((value / 1023) * 100)}%)`;
    } else {
      // PWM
      return `${value} (${Math.round((value / 255) * 100)}%)`;
    }
  };

  // Get appropriate icon for the pin type
  const getPinTypeIcon = () => {
    if (type === "digital") return <ToggleLeft className="h-4 w-4" />;
    if (type === "analog") return <Activity className="h-4 w-4" />;
    return <Sliders className="h-4 w-4" />;
  };

  // Get appropriate color for the pin state badge
  const getStateBadgeColor = () => {
    if (type === "digital") {
      return value === 1 ? "bg-green-500" : "bg-gray-400";
    }
    return "";
  };

  // Calculate progress percentage for analog/PWM values
  const getProgressPercentage = () => {
    if (type === "analog") {
      return (value / 1023) * 100;
    }
    return (value / 255) * 100;
  };

  // Format timestamp for last update
  const getLastUpdateText = () => {
    if (!lastUpdate) return "Never";

    const now = new Date();
    const diff = now.getTime() - lastUpdate.getTime();

    if (diff < 1000) return "Just now";
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

    return lastUpdate.toLocaleTimeString();
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <CardTitle className="flex items-center">
              {name}
              <Badge variant="outline" className="ml-2 flex items-center gap-1">
                {getPinTypeIcon()}
                {mode === "input" ? "Input" : "Output"}
              </Badge>
            </CardTitle>
            <div className="flex mt-1 text-xs text-muted-foreground">
              <Badge variant="outline">Pin: {pinNumber}</Badge>
              {pullMode > 0 && (
                <Badge
                  variant="outline"
                  className="ml-2 flex items-center gap-1"
                >
                  {pullMode === 1 ? (
                    <>
                      <ArrowUp className="h-3 w-3" />
                      Pull-Up
                    </>
                  ) : (
                    <>
                      <ArrowDown className="h-3 w-3" />
                      Pull-Down
                    </>
                  )}
                </Badge>
              )}
              {debounceMs > 0 && (
                <Badge
                  variant="outline"
                  className="ml-2 flex items-center gap-1"
                >
                  <Clock className="h-3 w-3" />
                  {debounceMs}ms
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditPin}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Pin
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
        {/* Status message display */}
        {statusMessage && (
          <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm rounded-md">
            {statusMessage}
          </div>
        )}

        {/* Pin State Display */}
        <div className="flex flex-col items-center justify-center p-4 border rounded-md">
          {type === "digital" ? (
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center ${
                value === 1
                  ? "bg-green-100 dark:bg-green-900"
                  : "bg-gray-100 dark:bg-gray-800"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full ${
                  value === 1 ? "bg-green-500" : "bg-gray-400"
                } flex items-center justify-center text-white font-bold`}
              >
                {value === 1 ? "HIGH" : "LOW"}
              </div>
            </div>
          ) : (
            <div className="w-full space-y-2">
              <div className="text-center text-2xl font-bold">{value}</div>
              <Progress value={getProgressPercentage()} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>{type === "analog" ? "1023" : "255"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls based on pin mode */}
        {mode === "input" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {type === "analog" && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id={`${id}-auto-refresh`}
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                  />
                  <Label htmlFor={`${id}-auto-refresh`}>Auto Refresh</Label>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="ml-auto"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              Current Value:{" "}
              <span className="font-medium text-foreground">
                {getValueDisplay()}
              </span>
            </div>

            <div className="text-xs text-muted-foreground flex justify-between">
              <span>Last Update: {getLastUpdateText()}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {type === "digital" ? (
              <Button
                className="w-full h-12"
                variant={value === 1 ? "default" : "outline"}
                onClick={toggleDigitalOutput}
              >
                <Zap
                  className={`h-5 w-5 mr-2 ${
                    value === 1 ? "" : "text-muted-foreground"
                  }`}
                />
                {value === 1 ? "HIGH" : "LOW"}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={`${id}-value-slider`}>Output Value</Label>
                  <span className="text-sm font-medium">{value}</span>
                </div>
                <Slider
                  id={`${id}-value-slider`}
                  value={[value]}
                  min={0}
                  max={type === "analog" ? 1023 : 255}
                  step={1}
                  onValueChange={(values) => handleValueChange(values[0])}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span>{type === "analog" ? "1023" : "255"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="info">
          <TabsList className="grid grid-cols-2 mb-2">
            <TabsTrigger value="info" className="text-xs">
              <Gauge className="h-3 w-3 mr-1" />
              Info
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="h-3 w-3 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Pin Number</span>
                <span className="font-medium">{pinNumber}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium">
                  {mode === "input" ? "Input" : "Output"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium capitalize">{type}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Range</span>
                <span className="font-medium">
                  {type === "digital"
                    ? "0-1"
                    : type === "analog"
                    ? "0-1023"
                    : "0-255"}
                </span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            {mode === "input" && (
              <>
                <div>
                  <Label htmlFor={`${id}-pull-mode`}>Pull Resistor</Label>
                  <Select
                    value={pullMode.toString()}
                    onValueChange={handlePullModeChange}
                  >
                    <SelectTrigger id={`${id}-pull-mode`} className="mt-1">
                      <SelectValue placeholder="Select pull mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">None</SelectItem>
                      <SelectItem value="1">Pull-Up</SelectItem>
                      <SelectItem value="2">Pull-Down</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {type === "digital" && (
                  <div>
                    <Label htmlFor={`${id}-debounce`}>Debounce (ms)</Label>
                    <Input
                      id={`${id}-debounce`}
                      type="number"
                      min="0"
                      max="1000"
                      value={debounceMs}
                      onChange={handleDebounceChange}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {debounceMs > 0
                        ? `Switch changes stable for ${debounceMs}ms will be reported.`
                        : "No debouncing (reports all changes)."}
                    </p>
                  </div>
                )}
              </>
            )}

            {mode === "output" && type === "pwm" && (
              <div>
                <Label htmlFor={`${id}-frequency`}>PWM Frequency</Label>
                <Select defaultValue="490">
                  <SelectTrigger id={`${id}-frequency`} className="mt-1">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="490">490 Hz</SelectItem>
                    <SelectItem value="980">980 Hz</SelectItem>
                    <SelectItem value="1960">1960 Hz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
