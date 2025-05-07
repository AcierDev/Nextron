"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlusCircle, ArrowLeft, Save, Loader2, PlaySquare } from "lucide-react";
import StepperCardDesign2 from "@/components/StepperCardDesign2";
import ServoCardHybrid from "@/components/ServoCardHybrid";
import IOPinCard from "@/components/IOPinCard";
import { NewComponentDialog } from "@/components/NewComponentDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { motion, AnimatePresence } from "framer-motion";

// Import shared types
import {
  HardwareConfig,
  ConfiguredComponent,
  FullConfigDataIPC,
} from "../../common/types";

// Define IPC handler interface
type IPCRemoveListener = () => void;
interface IPCHandler {
  send: (channel: string, value: unknown) => void;
  on: (
    channel: string,
    callback: (...args: unknown[]) => void
  ) => IPCRemoveListener;
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
}

// Extend Window interface
declare global {
  interface Window {
    ipc: IPCHandler;
  }
}

// Define types for our motors (from V0 component)
type StepperMotorDisplay = {
  id: string;
  type: "stepper";
  name: string;
  position: number;
  speed: number; // This is the live/current speed setting for the card
  acceleration: number; // This is the live/current accel setting for the card
  stepsPerInch: number;
  minPosition: number;
  maxPosition: number;
  pins: {
    step: number;
    direction: number;
    enable?: number;
  };
  // Add fields for initial settings from config
  initialJogUnit?: "steps" | "inches";
  initialJogAmount?: number;
  initialJogAmountInches?: number;
};

type ServoMotorDisplay = {
  id: string;
  type: "servo";
  name: string;
  angle: number;
  minAngle: number;
  maxAngle: number;
  pins: {
    control: number;
  };
  initialPresets?: number[];
};

type IOPinDisplay = {
  id: string;
  type: "iopin";
  name: string;
  pinNumber: number;
  mode: "input" | "output";
  pinType: "digital" | "analog" | "pwm";
  value: number;
};

type MotorDisplay = StepperMotorDisplay | ServoMotorDisplay | IOPinDisplay;

// Define the Configuration display type (simplified for dashboard header)
type ConfigurationDisplay = {
  id: string;
  name: string;
  description: string;
};

// Type for storing component states received from ESP32
interface ComponentStates {
  [componentId: string]: number | boolean | string | undefined;
}

// Connection Status Type (copied from DashboardClient)
type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "fetchingIp";

// Initial empty hardware config (using shared type)
const initialHardwareConfig: HardwareConfig = {
  servos: [],
  steppers: [],
  sensors: [],
  relays: [],
  pins: [],
};

// Removed Mock Configurations
// const mockConfigurations: Record<string, Configuration> = { ... };

// ConnectionManager component - add after imports
const ConnectionManager = ({
  connectionStatus,
  lastIpOctet,
  setLastIpOctet,
  isFetchingIp,
  setIsFetchingIp,
  handleConnect,
  setConnectionStatus,
  setErrorMessage,
  setInfoMessage,
  isConnectionDialogOpen,
  setIsConnectionDialogOpen,
}: {
  connectionStatus: ConnectionStatus;
  lastIpOctet: string;
  setLastIpOctet: (value: string) => void;
  isFetchingIp: boolean;
  setIsFetchingIp: (value: boolean) => void;
  handleConnect: (octet: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setErrorMessage: (message: string | null) => void;
  setInfoMessage: (message: string | null) => void;
  isConnectionDialogOpen: boolean;
  setIsConnectionDialogOpen: (open: boolean) => void;
}) => {
  if (connectionStatus === "fetchingIp") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      >
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Connecting to Board...
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Attempting automatic IP detection...
          </p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-6"></div>
          <Button
            variant="outline"
            onClick={() => {
              setIsFetchingIp(false);
              setErrorMessage(null);
              setConnectionStatus("idle");
              setIsConnectionDialogOpen(true);
            }}
            className="mt-4"
          >
            Enter IP Manually
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <Dialog
        open={isConnectionDialogOpen}
        onOpenChange={setIsConnectionDialogOpen}
      >
        <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Connect to Board
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Board IP Address
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400 font-mono pt-2">
                192.168.1.
              </span>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={lastIpOctet}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^\d{0,3}$/.test(value)) {
                    const num = parseInt(value, 10);
                    if (value === "" || (num >= 0 && num <= 255)) {
                      setLastIpOctet(value);
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    lastIpOctet &&
                    parseInt(lastIpOctet, 10) <= 255
                  ) {
                    handleConnect(lastIpOctet);
                    setIsConnectionDialogOpen(false);
                  }
                }}
                className="flex-1 w-20 text-center font-mono"
                placeholder="XXX"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConnectionStatus("fetchingIp");
                setIsFetchingIp(true);
                setErrorMessage(null);
                setIsConnectionDialogOpen(false);
              }}
            >
              Try Auto-Detect
            </Button>
            <Button
              onClick={() => {
                if (lastIpOctet && parseInt(lastIpOctet, 10) <= 255) {
                  handleConnect(lastIpOctet);
                  setIsConnectionDialogOpen(false);
                } else {
                  setErrorMessage("Please enter a valid IP ending (0-255)");
                }
              }}
              disabled={!lastIpOctet || parseInt(lastIpOctet, 10) > 255}
            >
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {connectionStatus === "error" && (
        <Button
          variant="outline"
          size="sm"
          className="ml-2 text-red-500 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30"
          onClick={() => setIsConnectionDialogOpen(true)}
        >
          Connection Failed - Retry
        </Button>
      )}

      {connectionStatus === "idle" && (
        <Button
          variant="outline"
          size="sm"
          className="ml-2"
          onClick={() => setIsConnectionDialogOpen(true)}
        >
          Connect to Board
        </Button>
      )}
    </>
  );
};

// Add custom type to WebSocket for pingIntervalId
interface EnhancedWebSocket extends WebSocket {
  pingIntervalId?: NodeJS.Timeout;
}

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configId = searchParams.get("config");
  const { toast } = useToast();

  // --- State --- //
  // Config state
  const [currentConfig, setCurrentConfig] =
    useState<ConfigurationDisplay | null>(null);
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfig>(
    initialHardwareConfig
  );
  const [motors, setMotors] = useState<MotorDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // Motor Dialog state
  const [isNewMotorOpen, setIsNewMotorOpen] = useState(false);

  const [editingMotor, setEditingMotor] = useState<MotorDisplay | null>(null);
  const [editPins, setEditPins] = useState({
    step: 0,
    direction: 0,
    enable: 0,
    control: 0,
  });

  // Connection state (copied from DashboardClient)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("fetchingIp");
  const [lastIpOctet, setLastIpOctet] = useState("");
  const [isFetchingIp, setIsFetchingIp] = useState(true);

  // Communication state with enhanced WebSocket type
  const ws = useRef<EnhancedWebSocket | null>(null);
  const [componentStates, setComponentStates] = useState<ComponentStates>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Connection dialog state - ensure this is defined as React.Dispatch type
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);

  // --- Helper Functions --- //

  // Function to transform HardwareConfig to MotorDisplay[]
  const transformHardwareToDisplay = useCallback(
    (hwConfig: HardwareConfig): MotorDisplay[] => {
      const displayMotors: MotorDisplay[] = [];

      hwConfig.servos.forEach((servo) => {
        const servoConfig = servo as any; // Type assertion for new fields
        displayMotors.push({
          id: servo.id,
          type: "servo",
          name: servo.name,
          angle: 90, // Default or last known state
          minAngle: servo.minAngle ?? 0,
          maxAngle: servo.maxAngle ?? 180,
          pins: { control: servo.pins[0] },
          initialPresets: servoConfig.presets ?? [0, 45, 90, 135, 180],
        });
      });

      hwConfig.steppers.forEach((stepper) => {
        const stepperConfig = stepper as any; // Type assertion
        displayMotors.push({
          id: stepper.id,
          type: "stepper",
          name: stepper.name,
          position: 0, // Default or last known state
          speed: stepperConfig.maxSpeed ?? 1000, // Map maxSpeed from config to speed prop for card
          acceleration: stepperConfig.acceleration ?? 500, // Map acceleration from config to accel prop for card
          stepsPerInch: stepperConfig.stepsPerInch ?? 2000,
          minPosition: stepperConfig.minPosition ?? -50000,
          maxPosition: stepperConfig.maxPosition ?? 50000,
          pins: {
            step: stepper.pins[0],
            direction: stepper.pins[1],
            enable: stepper.pins[2],
          },
          initialJogUnit: stepperConfig.jogUnit ?? "steps",
          initialJogAmount: stepperConfig.jogAmount ?? 200,
          initialJogAmountInches: stepperConfig.jogAmountInches ?? 0.1,
        });
      });

      // Transform pins array to IOPinDisplay objects
      hwConfig.pins.forEach((pin) => {
        // Extract pin properties from the component
        const mode = pin.type.includes("input") ? "input" : "output";
        let pinType: "digital" | "analog" | "pwm" = "digital";

        if (pin.type.includes("analog")) {
          pinType = "analog";
        } else if (pin.type.includes("pwm")) {
          pinType = "pwm";
        }

        displayMotors.push({
          id: pin.id,
          type: "iopin",
          name: pin.name,
          pinNumber: pin.pins[0],
          mode: mode,
          pinType: pinType,
          value:
            mode === "input"
              ? 0
              : pinType === "digital"
              ? 0
              : pinType === "analog"
              ? 512
              : 128,
        });
      });

      return displayMotors;
    },
    []
  );

  // --- Effects --- //

  // Load configuration from IPC
  useEffect(() => {
    // Reset states on config change
    setIsLoading(true);
    setIsConfigLoaded(false);
    setCurrentConfig(null);
    setHardwareConfig(initialHardwareConfig);
    setMotors([]);
    setConnectionStatus("idle");
    setErrorMessage(null);
    setInfoMessage(null);
    // Close existing WS if changing config
    if (ws.current) {
      console.log(
        "[Config Load Effect] Closing existing WebSocket due to config change."
      );
      ws.current.close();
      ws.current = null;
    }

    if (!configId) {
      console.error("No config ID provided in URL");
      setErrorMessage("No configuration ID found in URL.");
      setIsLoading(false);
      router.push("/configurations");
      return;
    }

    const loadConfig = async () => {
      setErrorMessage(null);
      setInfoMessage(null);
      try {
        console.log(`[Dashboard] Loading config ${configId} via IPC...`);
        const data: FullConfigDataIPC = await window.ipc.invoke(
          "get-config-by-id",
          configId
        );
        if (!data) {
          throw new Error("Configuration not found or failed to load.");
        }
        console.log("[Dashboard] Loaded config data:", data);

        setCurrentConfig({
          id: data._id,
          name: data.name,
          description: data.description || "",
        });

        const loadedHardware = data.hardware || initialHardwareConfig;
        setHardwareConfig(loadedHardware);

        setMotors(transformHardwareToDisplay(loadedHardware));
        setIsConfigLoaded(true);
      } catch (error) {
        console.error("[Dashboard] Error loading configuration:", error);
        setErrorMessage(
          `Failed to load configuration: ${(error as Error).message}`
        );
        setCurrentConfig(null);
        setHardwareConfig(initialHardwareConfig);
        setMotors([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [configId, router, transformHardwareToDisplay]);

  // Effect to initiate connection AFTER config is loaded
  useEffect(() => {
    if (
      isConfigLoaded &&
      connectionStatus === "idle" &&
      !isConnectionDialogOpen
    ) {
      console.log(
        "[Connect Trigger Effect] Config loaded, initiating connection sequence."
      );
      setConnectionStatus("fetchingIp");
      setIsFetchingIp(true);
      // IP detection effect will now pick this up
    }
  }, [isConfigLoaded, connectionStatus, isConnectionDialogOpen]);

  useEffect(() => {
    let errorTimer: NodeJS.Timeout | null = null;
    let infoTimer: NodeJS.Timeout | null = null;
    if (errorMessage) {
      errorTimer = setTimeout(() => setErrorMessage(null), 5000);
    }
    if (infoMessage) {
      infoTimer = setTimeout(() => setInfoMessage(null), 3000);
    }
    return () => {
      if (errorTimer) clearTimeout(errorTimer);
      if (infoTimer) clearTimeout(infoTimer);
    };
  }, [errorMessage, infoMessage]);

  // For WebSocket connection management, we need to declare function references first
  // to avoid circular dependencies

  // Step 1: Create function references
  let handleWebSocketMessage: (event: MessageEvent) => void;
  let syncConfigWithESP32: () => void;
  let handleConnect: (lastOctet: string) => void;
  let sendMessage: (message: object) => boolean;

  // Step 2: Implement the message handler first as it has no dependencies on other functions
  handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      console.log("WebSocket message received:", event.data);
      try {
        if (
          event.data &&
          typeof event.data === "string" &&
          event.data.startsWith("{")
        ) {
          const message = JSON.parse(event.data);
          let stateValue: number | boolean | string | undefined = undefined;
          let updateId: string | null = null;

          // Handle pong messages (responses to ping)
          if (message.action === "pong") {
            // Just log the pong if needed, but don't treat as unhandled
            console.debug("Received pong response:", message);
            return;
          }

          if (message.id !== undefined) {
            updateId = message.id;

            // Forward message to IOPinCard components through a custom event
            if (message.value !== undefined || message.status !== undefined) {
              // Create and dispatch a custom event with the message data
              const customEvent = new CustomEvent("websocket-message", {
                detail: message,
              });
              window.dispatchEvent(customEvent);
            }

            // Extract the value based on various possible fields
            if (message.state !== undefined) {
              stateValue = message.state;
            } else if (message.value !== undefined) {
              stateValue = message.value;
            } else if (message.position !== undefined) {
              stateValue = message.position;
            } else if (message.angle !== undefined) {
              stateValue = message.angle;
            }
          }

          if (updateId !== null && stateValue !== undefined) {
            console.log(
              `Updating state for ${
                message.type ?? "component"
              } ${updateId}: ${stateValue}`
            );
            setComponentStates((prevStates) => ({
              ...prevStates,
              [updateId as string]: stateValue,
            }));

            setMotors((prevMotors) =>
              prevMotors.map((motor) => {
                if (motor.id === updateId) {
                  if (
                    motor.type === "servo" &&
                    typeof stateValue === "number"
                  ) {
                    return { ...motor, angle: stateValue };
                  }
                  if (
                    motor.type === "stepper" &&
                    typeof stateValue === "number"
                  ) {
                    return { ...motor, position: stateValue };
                  }
                  if (
                    motor.type === "iopin" &&
                    typeof stateValue === "number"
                  ) {
                    return { ...motor, value: stateValue };
                  }
                }
                return motor;
              })
            );
          } else {
            console.log("Received unhandled/incomplete JSON message:", message);
          }
        } else if (typeof event.data === "string") {
          console.log("Received text message from ESP32:", event.data);
          if (event.data.startsWith("ERROR:")) {
            setErrorMessage(event.data);
          } else if (event.data.startsWith("OK:")) {
            // Handle OK messages if needed
          }
        }
      } catch (error) {
        console.error(
          "Failed to process WebSocket message:",
          event.data,
          error
        );
        setErrorMessage("Error processing message from device.");
      }
    },
    [setComponentStates, setMotors, setErrorMessage]
  );

  // Step 3: Now implement syncConfig which uses sendMessage
  syncConfigWithESP32 = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot sync config: WebSocket not open.");
      setErrorMessage("Cannot sync: Not connected.");
      return;
    }

    console.log("Syncing loaded configuration with ESP32...");
    setInfoMessage("Syncing configuration with device...");

    const allComponents: ConfiguredComponent[] =
      Object.values(hardwareConfig).flat();

    if (allComponents.length === 0) {
      console.log("No components in the current configuration to sync.");
      setInfoMessage("Sync complete (No components).");
      setTimeout(() => setInfoMessage(null), 1500);
      return;
    }

    const componentGroups: (keyof HardwareConfig)[] = [
      "servos",
      "steppers",
      "sensors",
      "relays",
      "pins",
    ];

    componentGroups.forEach((group) => {
      // Add safety check to ensure the group exists and is an array
      if (Array.isArray(hardwareConfig[group])) {
        hardwareConfig[group].forEach((component) => {
          let configPayload: any = { id: component.id, name: component.name };

          switch (group) {
            case "servos":
              configPayload.pin = component.pins[0];
              if (component.minAngle !== undefined)
                configPayload.minAngle = component.minAngle;
              if (component.maxAngle !== undefined)
                configPayload.maxAngle = component.maxAngle;
              break;
            case "steppers":
              configPayload.pulPin = component.pins[0];
              configPayload.dirPin = component.pins[1];
              if (component.pins.length > 2 && component.pins[2] != null)
                configPayload.enaPin = component.pins[2];
              if (component.maxSpeed !== undefined)
                configPayload.maxSpeed = component.maxSpeed;
              if (component.acceleration !== undefined)
                configPayload.acceleration = component.acceleration;
              break;
            case "sensors":
              configPayload.type = component.type;
              configPayload.pins = component.pins;
              break;
            case "relays":
              configPayload.pin = component.pins[0];
              configPayload.type = component.type;
              break;
            case "pins":
              configPayload.pin = component.pins[0];
              configPayload.type = component.type;
              break;
          }

          try {
            console.log(
              `Sync: Sending configure for ${group}: ${component.name} (ID: ${component.id})`
            );

            // To avoid circular dependency, use direct WebSocket send
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              const message = {
                action: "configure",
                componentGroup: group,
                config: configPayload,
              };
              ws.current.send(JSON.stringify(message));
            }
          } catch (error) {
            console.error(`Failed to send config for ${component.id}:`, error);
          }
        });
      } else {
        console.warn(
          `Hardware config group '${group}' is not an array or is missing. Skipping sync for this group.`
        );
      }
    });

    console.log("Finished sending initial configuration sync to ESP32.");
    setInfoMessage("Sync complete!");
    setTimeout(() => setInfoMessage(null), 1500);
  }, [hardwareConfig, setInfoMessage, setErrorMessage]);

  // Step 4: Implement handleConnect which uses syncConfig
  handleConnect = useCallback(
    (lastOctet: string) => {
      // Prevent starting a new connection if already connecting
      if (connectionStatus === "connecting") {
        console.log(
          "Connection attempt already in progress. Skipping new request."
        );
        return;
      }

      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log("WebSocket already open.");
        setConnectionStatus("connected"); // Ensure status is correct
        return;
      }

      // Close any existing connection
      if (ws.current) {
        console.log("Closing existing WebSocket before new connection attempt");
        try {
          // Only close if it's open or connecting, ignore other states
          if (
            ws.current.readyState === WebSocket.OPEN ||
            ws.current.readyState === WebSocket.CONNECTING
          ) {
            ws.current.close();
          }
        } catch (closeError) {
          console.warn("Error closing previous WebSocket:", closeError);
        }
        ws.current = null;
      }

      setConnectionStatus("connecting");
      setErrorMessage(null);
      setInfoMessage("Connecting to device...");

      const octetNum = parseInt(lastOctet, 10);
      if (isNaN(octetNum) || octetNum < 0 || octetNum > 255) {
        setConnectionStatus("error");
        setErrorMessage("Invalid IP address ending (must be 0-255)");
        setInfoMessage(null);
        setIsFetchingIp(false);
        return;
      }

      const fullIp = `192.168.1.${lastOctet}`;
      const wsUrl = `ws://${fullIp}/ws`;
      console.log(`Attempting to connect to WebSocket: ${wsUrl}`);

      try {
        ws.current = new WebSocket(wsUrl);

        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
          if (ws.current && ws.current.readyState !== WebSocket.OPEN) {
            console.error("WebSocket connection timeout");
            setConnectionStatus("error");
            setErrorMessage(
              `Connection to ${fullIp} timed out. Device may be offline.`
            );
            setInfoMessage(null);
            ws.current.close();
            ws.current = null;
          }
        }, 5000); // 5 second timeout

        ws.current.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log("WebSocket connection established");
          setConnectionStatus("connected");
          setErrorMessage(null);
          setInfoMessage("Connected! Syncing configuration...");
          setIsFetchingIp(false);

          // Make sure ws.current is still valid before syncing and setting up ping
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            // Sync config after connection is established
            syncConfigWithESP32();

            // Start a periodic ping to keep connection alive
            const pingInterval = setInterval(() => {
              if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                console.log("Sending ping to keep connection alive");
                try {
                  ws.current.send(
                    JSON.stringify({
                      action: "ping",
                      componentGroup: "system",
                      timestamp: Date.now(),
                    })
                  );
                } catch (error) {
                  console.error("Failed to send ping:", error);
                  clearInterval(pingInterval);
                }
              } else {
                clearInterval(pingInterval);
              }
            }, 30000); // 30 second ping

            // Store the interval ID in a ref so we can clear it on unmount
            // Make an additional check that ws.current is still valid
            if (ws.current) {
              try {
                // Clear any existing ping interval first
                const wsWithPing = ws.current as EnhancedWebSocket;
                if (wsWithPing.pingIntervalId) {
                  console.log(
                    "Clearing previous ping interval before setting new one"
                  );
                  clearInterval(wsWithPing.pingIntervalId);
                }

                // Set the new interval ID
                wsWithPing.pingIntervalId = pingInterval;
                console.log(`Ping interval set, ID: ${pingInterval}`);
              } catch (error) {
                console.error("Failed to store ping interval ID:", error);
                clearInterval(pingInterval);
              }
            } else {
              // If ws.current is gone, clear the interval
              clearInterval(pingInterval);
            }
          }
        };

        ws.current.onmessage = (event) => {
          // Add null check before processing messages
          if (ws.current) {
            handleWebSocketMessage(event);
          }
        };

        ws.current.onerror = (event) => {
          clearTimeout(connectionTimeout);
          console.error("WebSocket error:", event);
          setConnectionStatus("error");
          setErrorMessage("Connection error. Check IP and device status.");
          setInfoMessage(null);
          // Safely clear interval with null check
          if (ws.current) {
            try {
              const wsWithPing = ws.current as EnhancedWebSocket;
              if (wsWithPing.pingIntervalId) {
                console.log(
                  `Clearing ping interval on error, ID: ${wsWithPing.pingIntervalId}`
                );
                clearInterval(wsWithPing.pingIntervalId);
                wsWithPing.pingIntervalId = undefined; // Clear the reference
              }
            } catch (error) {
              console.error("Error clearing ping interval on error:", error);
            }
            // Clear the WebSocket reference on error
            console.log("Setting ws.current to null on error");
            ws.current = null;
          }
          setIsFetchingIp(false);
        };

        ws.current.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log("WebSocket closed:", event.code, event.reason);
          // If the status was 'connected' before closing, set to 'idle'.
          // If it was 'connecting' or 'fetchingIp', it likely transitioned to 'error' already.
          // We only want to reset to 'idle' if it wasn't an immediate connection failure.
          if (connectionStatus === "connected") {
            setConnectionStatus("idle");
            setInfoMessage("Disconnected from device.");
            setErrorMessage(null);
          }
          // Safely clear interval with null check
          if (ws.current) {
            try {
              const wsWithPing = ws.current as EnhancedWebSocket;
              if (wsWithPing.pingIntervalId) {
                console.log(
                  `Clearing ping interval on close, ID: ${wsWithPing.pingIntervalId}`
                );
                clearInterval(wsWithPing.pingIntervalId);
                wsWithPing.pingIntervalId = undefined; // Clear the reference
              }
            } catch (error) {
              console.error("Error clearing ping interval on close:", error);
            }
          }
          // Ensure ws.current is nullified on close regardless of previous state
          console.log("Setting ws.current to null on close");
          ws.current = null;
          setIsFetchingIp(false); // Also reset fetching IP flag
        };
      } catch (error) {
        console.error("Failed to create WebSocket:", error);
        setConnectionStatus("error");
        setErrorMessage(
          `Failed to initiate connection: ${(error as Error).message}`
        );
        setInfoMessage(null);
        ws.current = null;
        setIsFetchingIp(false);
      }
    },
    [
      syncConfigWithESP32,
      handleWebSocketMessage,
      connectionStatus,
      setConnectionStatus,
      setErrorMessage,
      setInfoMessage,
      setIsFetchingIp,
    ]
  );

  // Step 5: Finally implement sendMessage which depends on handleConnect
  sendMessage = useCallback(
    (message: object) => {
      try {
        if (!ws.current) {
          console.warn("WebSocket is null. Cannot send message:", message);
          setErrorMessage("Not connected to device. Please reconnect.");
          setTimeout(() => setErrorMessage(null), 3000);
          return false;
        }

        if (ws.current.readyState !== WebSocket.OPEN) {
          console.warn(
            "WebSocket not open. Cannot send message:",
            message,
            "Current state:",
            ws.current.readyState
          );
          setErrorMessage("Connection not ready. Please reconnect.");
          setTimeout(() => setErrorMessage(null), 3000);

          // Try to reconnect if we have a last IP and aren't already connecting
          if (
            connectionStatus !== "connecting" &&
            connectionStatus !== "fetchingIp" &&
            lastIpOctet
          ) {
            setInfoMessage("Attempting to reconnect...");
            setConnectionStatus("connecting");
            handleConnect(lastIpOctet);
          }
          return false;
        }

        // If we get here, WebSocket is open and ready to send
        try {
          const jsonMessage = JSON.stringify(message);
          console.log("Sending WebSocket message:", jsonMessage);
          ws.current.send(jsonMessage);
          return true;
        } catch (sendError) {
          console.error(
            "Failed to stringify or send WebSocket message:",
            sendError
          );
          if (sendError instanceof Error) {
            setErrorMessage(`Failed to send message: ${sendError.message}`);
          } else {
            setErrorMessage("Failed to send message");
          }
          setTimeout(() => setErrorMessage(null), 3000);
          return false;
        }
      } catch (unexpectedError) {
        console.error("Unexpected error in sendMessage:", unexpectedError);
        setErrorMessage("An unexpected error occurred while sending message");
        setTimeout(() => setErrorMessage(null), 3000);
        return false;
      }
    },
    [
      connectionStatus,
      lastIpOctet,
      handleConnect,
      setConnectionStatus,
      setErrorMessage,
      setInfoMessage,
    ]
  );

  // --- Motor CRUD Handlers (To be adapted) --- //

  // Handle motor deletion
  const handleDeleteMotor = (id: string) => {
    let group: keyof HardwareConfig | null = null;
    if (hardwareConfig.servos.some((m) => m.id === id)) group = "servos";
    else if (hardwareConfig.steppers.some((m) => m.id === id))
      group = "steppers";
    else if (hardwareConfig.pins.some((m) => m.id === id)) group = "pins";

    if (!group) {
      console.error(
        `Cannot delete component ${id}: Not found in hardware config.`
      );
      setErrorMessage("Failed to find component to delete.");
      return;
    }

    console.log(`Requesting removal of ${group} with id ${id}`);
    sendMessage({ action: "remove", componentGroup: group, id: id });

    setHardwareConfig((prev) => {
      const updatedGroup = prev[group as keyof HardwareConfig].filter(
        (comp) => comp.id !== id
      );
      return { ...prev, [group as keyof HardwareConfig]: updatedGroup };
    });

    setComponentStates((prev) => {
      const newStates = { ...prev };
      delete newStates[id];
      return newStates;
    });

    setInfoMessage("Component removed. Remember to Save Configuration.");
  };

  useEffect(() => {
    setMotors(transformHardwareToDisplay(hardwareConfig));
  }, [hardwareConfig, transformHardwareToDisplay]);

  // Handle motor duplication
  const handleDuplicateMotor = (motorToDup: MotorDisplay) => {
    let originalComponent: ConfiguredComponent | undefined;
    let group: keyof HardwareConfig | null = null;

    if (motorToDup.type === "servo") {
      originalComponent = hardwareConfig.servos.find(
        (m) => m.id === motorToDup.id
      );
      group = "servos";
    } else if (motorToDup.type === "stepper") {
      originalComponent = hardwareConfig.steppers.find(
        (m) => m.id === motorToDup.id
      );
      group = "steppers";
    } else if (motorToDup.type === "iopin") {
      originalComponent = hardwareConfig.pins.find(
        (m) => m.id === motorToDup.id
      );
      group = "pins";
    }

    if (!originalComponent || !group) {
      console.error(
        `Cannot duplicate component ${motorToDup.id}: Original not found.`
      );
      setErrorMessage("Failed to find original component to duplicate.");
      return;
    }

    const newId = `${motorToDup.type}-${Date.now()}`;
    const newName = `${motorToDup.name} (Copy)`;

    const duplicatedComponent: ConfiguredComponent = {
      ...originalComponent,
      id: newId,
      name: newName,
    };

    console.log(
      `Duplicating ${group}: ${originalComponent.name} -> ${newName}`
    );

    setHardwareConfig((prev) => ({
      ...prev,
      [group as keyof HardwareConfig]: [
        ...prev[group as keyof HardwareConfig],
        duplicatedComponent,
      ],
    }));

    let configPayload: any = { id: newId, name: newName };
    if (group === "servos") {
      configPayload.pin = duplicatedComponent.pins[0];
      if (duplicatedComponent.minAngle !== undefined)
        configPayload.minAngle = duplicatedComponent.minAngle;
      if (duplicatedComponent.maxAngle !== undefined)
        configPayload.maxAngle = duplicatedComponent.maxAngle;
    } else if (group === "steppers") {
      configPayload.pulPin = duplicatedComponent.pins[0];
      configPayload.dirPin = duplicatedComponent.pins[1];
      if (
        duplicatedComponent.pins.length > 2 &&
        duplicatedComponent.pins[2] != null
      )
        configPayload.enaPin = duplicatedComponent.pins[2];
      if (duplicatedComponent.maxSpeed !== undefined)
        configPayload.maxSpeed = duplicatedComponent.maxSpeed;
      if (duplicatedComponent.acceleration !== undefined)
        configPayload.acceleration = duplicatedComponent.acceleration;
    } else if (group === "pins") {
      configPayload.pin = duplicatedComponent.pins[0];
      // For IO pins, extract mode and type from the component.type string
      // Format is expected to be like "digital_output" or "analog_input"
      const typeParts = duplicatedComponent.type.split("_");
      if (typeParts.length === 2) {
        configPayload.pinType = typeParts[0]; // "digital", "analog", or "pwm"
        configPayload.mode = typeParts[1]; // "input" or "output"
      }
    }
    sendMessage({
      action: "configure",
      componentGroup: group,
      config: configPayload,
    });

    setInfoMessage("Component duplicated. Remember to Save Configuration.");
  };

  // Handle opening edit pins dialog
  const handleEditPins = (motor: MotorDisplay) => {
    setEditingMotor(motor);
    if (motor.type === "stepper") {
      setEditPins({
        step: motor.pins.step,
        direction: motor.pins.direction,
        enable: motor.pins.enable || 0,
        control: 0,
      });
    } else if (motor.type === "servo") {
      setEditPins({
        step: 0,
        direction: 0,
        enable: 0,
        control: motor.pins.control,
      });
    } else if (motor.type === "iopin") {
      // For IO pins we only use a single pin
      setEditPins({
        step: 0,
        direction: 0,
        enable: 0,
        control: motor.pinNumber, // Store the pin number in the control field temporarily
      });
    }
    toast({
      title: "Edit Pins Action",
      description: "Need to implement Edit Pins Dialog.",
    });
  };

  // Handle saving edited pins (placeholder - needs dialog)
  const handleSavePins = () => {
    if (!editingMotor) return;

    let group: keyof HardwareConfig;
    let pinsArray: number[];
    let updatedComponent: Partial<ConfiguredComponent> = { pins: [] };

    if (editingMotor.type === "stepper") {
      group = "steppers";
      pinsArray = [editPins.step, editPins.direction];
      if (editPins.enable) pinsArray.push(editPins.enable);
      updatedComponent.pins = pinsArray;
    } else if (editingMotor.type === "servo") {
      group = "servos";
      pinsArray = [editPins.control];
      updatedComponent.pins = pinsArray;
    } else {
      // IO Pin
      group = "pins";
      pinsArray = [editPins.control]; // Using the control field for the pin number
      updatedComponent.pins = pinsArray;
    }

    setHardwareConfig((prev) => ({
      ...prev,
      [group]: prev[group].map((comp) =>
        comp.id === editingMotor.id ? { ...comp, ...updatedComponent } : comp
      ),
    }));

    const originalComponent = hardwareConfig[group].find(
      (c) => c.id === editingMotor.id
    );
    if (originalComponent) {
      let configPayload: any = {
        id: editingMotor.id,
        name: originalComponent.name,
      };
      if (group === "servos") {
        configPayload.pin = editPins.control;
        if (originalComponent.minAngle !== undefined)
          configPayload.minAngle = originalComponent.minAngle;
        if (originalComponent.maxAngle !== undefined)
          configPayload.maxAngle = originalComponent.maxAngle;
      } else if (group === "steppers") {
        configPayload.pulPin = editPins.step;
        configPayload.dirPin = editPins.direction;
        if (editPins.enable) configPayload.enaPin = editPins.enable;
        if (originalComponent.maxSpeed !== undefined)
          configPayload.maxSpeed = originalComponent.maxSpeed;
        if (originalComponent.acceleration !== undefined)
          configPayload.acceleration = originalComponent.acceleration;
      } else if (group === "pins") {
        configPayload.pin = editPins.control;
        // Extract mode and type from component.type (e.g., "digital_output")
        const typeParts = originalComponent.type.split("_");
        if (typeParts.length === 2) {
          configPayload.pinType = typeParts[0];
          configPayload.mode = typeParts[1];
        }
      }
      sendMessage({
        action: "configure",
        componentGroup: group,
        config: configPayload,
      });
    }

    setEditingMotor(null);
    setInfoMessage("Pins updated. Remember to Save Configuration.");
  };

  // NEW: Handler for live stepper settings changes from StepperCardDesign2
  const handleStepperSettingsChange = useCallback(
    (
      motorId: string,
      newSettings: {
        minPosition?: number;
        maxPosition?: number;
        stepsPerInch?: number;
        jogUnit?: "steps" | "inches";
        jogAmount?: number; // Corresponds to steps if jogUnit is steps
        jogAmountInches?: number; // Corresponds to inches if jogUnit is inches
        speed?: number; // This is 'maxSpeed' in the hardwareConfig
        acceleration?: number; // This is 'acceleration' in the hardwareConfig
      }
    ) => {
      setHardwareConfig((prevHwConfig) => {
        const updatedSteppers = prevHwConfig.steppers.map((stepper) => {
          if (stepper.id === motorId) {
            const updatedStepper = { ...stepper } as any; // Assert type for modification
            if (newSettings.minPosition !== undefined) {
              updatedStepper.minPosition = newSettings.minPosition;
            }
            if (newSettings.maxPosition !== undefined) {
              updatedStepper.maxPosition = newSettings.maxPosition;
            }
            if (newSettings.stepsPerInch !== undefined) {
              updatedStepper.stepsPerInch = newSettings.stepsPerInch;
            }
            if (newSettings.jogUnit !== undefined) {
              updatedStepper.jogUnit = newSettings.jogUnit;
            }
            if (newSettings.jogAmount !== undefined) {
              // This is for steps
              updatedStepper.jogAmount = newSettings.jogAmount;
            }
            if (newSettings.jogAmountInches !== undefined) {
              updatedStepper.jogAmountInches = newSettings.jogAmountInches;
            }
            if (newSettings.speed !== undefined) {
              // Card sends 'speed'
              updatedStepper.maxSpeed = newSettings.speed; // Save as 'maxSpeed' in config
            }
            if (newSettings.acceleration !== undefined) {
              updatedStepper.acceleration = newSettings.acceleration;
            }
            return updatedStepper;
          }
          return stepper;
        });
        return { ...prevHwConfig, steppers: updatedSteppers };
      });
    },
    [setHardwareConfig]
  );

  // NEW: Handler for live servo settings changes from ServoCardHybrid
  const handleServoSettingsChange = useCallback(
    (
      servoId: string,
      newSettings: {
        presets?: number[];
        minAngle?: number;
        maxAngle?: number;
      }
    ) => {
      setHardwareConfig((prevHwConfig) => {
        const updatedServos = prevHwConfig.servos.map((servo) => {
          if (servo.id === servoId) {
            const updatedServo = { ...servo } as any; // Assert type for modification
            if (newSettings.presets !== undefined) {
              updatedServo.presets = newSettings.presets;
            }
            if (newSettings.minAngle !== undefined) {
              updatedServo.minAngle = newSettings.minAngle;
            }
            if (newSettings.maxAngle !== undefined) {
              updatedServo.maxAngle = newSettings.maxAngle;
            }
            return updatedServo;
          }
          return servo;
        });
        return { ...prevHwConfig, servos: updatedServos };
      });
    },
    [setHardwareConfig]
  );

  // Handle saving the configuration
  const handleSaveConfiguration = async () => {
    if (!currentConfig) {
      setErrorMessage("Cannot save: No configuration loaded.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setInfoMessage("Saving configuration...");
    try {
      console.log(`[Dashboard] Saving config ${currentConfig.id} via IPC...`);
      const updatedConfig = await window.ipc.invoke(
        "update-config",
        currentConfig.id,
        hardwareConfig
      );
      console.log("Save successful:", updatedConfig);
      setInfoMessage(
        `Configuration '${currentConfig.name}' saved successfully!`
      );
    } catch (error) {
      console.error("[Dashboard] Error saving configuration:", error);
      setErrorMessage(
        `Failed to save configuration: ${(error as Error).message}`
      );
      setInfoMessage(null);
    } finally {
      setIsSaving(false);
    }
  };

  // Add back cleanup effect for WebSocket
  useEffect(() => {
    // Store the current ws ref to use in the cleanup function
    const wsInstance = ws.current;
    console.log(
      "Component mounted, current WebSocket instance:",
      wsInstance ? "exists" : "null"
    );

    return () => {
      console.log("Component unmounting, performing WebSocket cleanup");
      try {
        // Use the stored instance in cleanup
        if (wsInstance) {
          console.log("Closing WebSocket connection on component unmount");

          // Clear ping interval if it exists
          try {
            const wsWithPing = wsInstance as EnhancedWebSocket;
            if (wsWithPing.pingIntervalId) {
              console.log(
                `Clearing ping interval on unmount, ID: ${wsWithPing.pingIntervalId}`
              );
              clearInterval(wsWithPing.pingIntervalId);
              wsWithPing.pingIntervalId = undefined; // Clear the reference
            }
          } catch (err) {
            console.error("Error clearing ping interval:", err);
          }

          // Remove event handlers to prevent potential memory leaks
          try {
            wsInstance.onopen = null;
            wsInstance.onmessage = null;
            wsInstance.onclose = null;
            wsInstance.onerror = null;
          } catch (err) {
            console.error("Error clearing event handlers:", err);
          }

          // Close the connection
          try {
            if (
              wsInstance.readyState === WebSocket.OPEN ||
              wsInstance.readyState === WebSocket.CONNECTING
            ) {
              wsInstance.close();
            }
          } catch (err) {
            console.error("Error closing WebSocket:", err);
          }

          // Set the ref to null only if it hasn't been replaced by a newer instance
          if (ws.current === wsInstance) {
            console.log("Clearing ws.current reference on unmount");
            ws.current = null;
          }
        }

        // Stop IP watch process if active
        // This might be redundant if stopped elsewhere, but safe to include
        try {
          console.log("Stopping IP watch in main process (unmount cleanup).");
          window.ipc.send("stop-ip-watch", {});
        } catch (err) {
          console.error("Error stopping IP watch during unmount:", err);
        }

        // Avoid setting state in unmount cleanup
        // setIsFetchingIp(false);
      } catch (error) {
        console.error("Error during WebSocket unmount cleanup:", error);
      }
    };
  }, []); // <-- Empty dependency array to ensure this runs only on mount/unmount

  // Add reconnection attempt functionality
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;

    // If we're in error state and we have a lastIpOctet, try to reconnect after a delay
    if (connectionStatus === "error" && lastIpOctet) {
      reconnectTimer = setTimeout(() => {
        console.log("Attempting to reconnect after connection error...");
        handleConnect(lastIpOctet);
      }, 10000); // Try to reconnect after 10 seconds
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [connectionStatus, lastIpOctet, handleConnect]);

  // Add back IP detection effect
  useEffect(() => {
    let cleanupListener: IPCRemoveListener | null = null;
    let ipDetectionTimeout: NodeJS.Timeout | null = null;

    if (connectionStatus === "fetchingIp") {
      console.log("Setting up IPC listener for IP detection...");

      // Set timeout for IP detection after 3 seconds
      ipDetectionTimeout = setTimeout(() => {
        if (connectionStatus === "fetchingIp") {
          console.log(
            "IP detection timed out after 3 seconds, opening manual input dialog"
          );
          setIsFetchingIp(false);
          setErrorMessage("IP detection timed out. Please enter IP manually.");
          setConnectionStatus("idle"); // Set to idle to prevent reconnect
          // Open manual IP dialog
          setIsConnectionDialogOpen(true);
        }
      }, 3000); // 3 second timeout

      const handleIpUpdate = (data: { ip?: string; error?: string }) => {
        console.log("IPC: IP Update Received:", data);

        if (connectionStatus !== "fetchingIp") {
          console.log(
            "IPC: Ignoring IP update, no longer in fetchingIp state."
          );
          return;
        }

        // Clear the timeout since we got a response
        if (ipDetectionTimeout) {
          clearTimeout(ipDetectionTimeout);
          ipDetectionTimeout = null;
        }

        if (data.ip) {
          const prefix = "192.168.1.";
          if (data.ip.startsWith(prefix)) {
            const octet = data.ip.substring(prefix.length);
            const octetNum = parseInt(octet, 10);
            if (!isNaN(octetNum) && octetNum >= 0 && octetNum <= 255) {
              console.log(
                `IPC: Extracted last octet: ${octet}. Attempting connection.`
              );
              setLastIpOctet(octet);
              handleConnect(octet);
            } else {
              console.error("IPC: Invalid IP format received:", data.ip);
              setErrorMessage("Received invalid IP format from device.");
              setConnectionStatus("error");
              setIsFetchingIp(false);
            }
          } else {
            console.error(
              "IPC: IP received doesn't start with 192.168.1.:",
              data.ip
            );
            setErrorMessage("Received unexpected IP format from device.");
            setConnectionStatus("error");
            setIsFetchingIp(false);
          }
        } else if (data.error) {
          console.error("IPC: IP detection error:", data.error);
          setErrorMessage(
            `IP detection failed: ${data.error}. Try manual connection.`
          );
          setConnectionStatus("error");
          setIsFetchingIp(false);
        }
      };

      cleanupListener = window.ipc.on("ip-update", handleIpUpdate);
      window.ipc.send("start-ip-watch", {});
    }

    return () => {
      if (cleanupListener) {
        console.log("Cleaning up IPC IP detection listener.");
        cleanupListener();
      }
      if (ipDetectionTimeout) {
        clearTimeout(ipDetectionTimeout);
      }
      if (connectionStatus === "fetchingIp") {
        console.log("Stopping IP watch in main process (cleanup).");
        window.ipc.send("stop-ip-watch", {});
      }
    };
  }, [
    connectionStatus,
    handleConnect,
    setLastIpOctet,
    setErrorMessage,
    setConnectionStatus,
    setIsFetchingIp,
    setIsConnectionDialogOpen,
  ]);

  // --- Render Logic --- //

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
        <p className="ml-4 text-white text-lg">Loading Configuration...</p>
      </div>
    );
  }

  if (!currentConfig && errorMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4">
        <h2 className="text-2xl font-semibold text-red-400 mb-4">
          Error Loading Configuration
        </h2>
        <p className="text-center mb-6">{errorMessage}</p>
        <Button onClick={() => router.push("/configurations")}>
          Back to Configurations
        </Button>
      </div>
    );
  }

  if (!currentConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>No configuration loaded.</p>
        <Button onClick={() => router.push("/configurations")} className="ml-4">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            key="error-msg-dash-global"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 right-4 z-50 p-3 rounded-md bg-red-900/80 backdrop-blur-sm text-red-100 text-sm shadow-lg max-w-md"
          >
            {errorMessage}
          </motion.div>
        )}
        {infoMessage && (
          <motion.div
            key="info-msg-dash-global"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 right-4 z-50 p-3 rounded-md bg-blue-900/80 backdrop-blur-sm text-blue-100 text-sm shadow-lg max-w-md"
          >
            {infoMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="container mx-auto p-4 md:p-6">
        <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push("/configurations")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1
                className="text-3xl font-bold text-gray-900 dark:text-white truncate"
                title={currentConfig.name}
              >
                {currentConfig.name}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Status:{" "}
                <span
                  className={`font-medium ${
                    connectionStatus === "connected"
                      ? "text-green-500"
                      : connectionStatus === "error"
                      ? "text-red-500"
                      : "text-yellow-500"
                  }`}
                >
                  {connectionStatus === "fetchingIp"
                    ? "Detecting IP"
                    : connectionStatus}
                </span>
                {connectionStatus === "connected" &&
                  ` (192.168.1.${lastIpOctet})`}
                {connectionStatus === "connecting" && (
                  <Loader2 className="inline-block h-4 w-4 animate-spin ml-1" />
                )}
                <ConnectionManager
                  connectionStatus={connectionStatus}
                  lastIpOctet={lastIpOctet}
                  setLastIpOctet={setLastIpOctet}
                  isFetchingIp={isFetchingIp}
                  setIsFetchingIp={setIsFetchingIp}
                  handleConnect={handleConnect}
                  setConnectionStatus={setConnectionStatus}
                  setErrorMessage={setErrorMessage}
                  setInfoMessage={setInfoMessage}
                  isConnectionDialogOpen={isConnectionDialogOpen}
                  setIsConnectionDialogOpen={setIsConnectionDialogOpen}
                />
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => router.push(`/sequences?config=${configId}`)}
            >
              <PlaySquare className="h-4 w-4" />
              Sequences
            </Button>
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => setIsNewMotorOpen(true)}
              disabled={isSaving}
            >
              <PlusCircle className="h-4 w-4" />
              Add Component
            </Button>
            <Button
              className="flex items-center gap-2"
              onClick={handleSaveConfiguration}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </header>

        {motors.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
              No Components Added
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Add your first component to this configuration
            </p>
            <Button onClick={() => setIsNewMotorOpen(true)} disabled={isSaving}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Component
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {motors.map((motor) => {
              if (motor.type === "stepper") {
                // Ensure all props for StepperMotorDisplay are passed
                const stepperMotor = motor as StepperMotorDisplay;
                return (
                  <StepperCardDesign2
                    key={stepperMotor.id}
                    id={stepperMotor.id}
                    name={stepperMotor.name}
                    position={
                      (componentStates[stepperMotor.id] as number) ??
                      stepperMotor.position
                    }
                    speed={stepperMotor.speed} // This is initialSpeed for the card
                    acceleration={stepperMotor.acceleration} // This is initialAcceleration for the card
                    stepsPerInch={stepperMotor.stepsPerInch}
                    minPosition={stepperMotor.minPosition}
                    maxPosition={stepperMotor.maxPosition}
                    pins={stepperMotor.pins}
                    initialJogUnit={stepperMotor.initialJogUnit}
                    initialJogAmount={stepperMotor.initialJogAmount}
                    initialJogAmountInches={stepperMotor.initialJogAmountInches}
                    onDelete={() => handleDeleteMotor(stepperMotor.id)}
                    onDuplicate={() => handleDuplicateMotor(stepperMotor)}
                    onEditPins={() => handleEditPins(stepperMotor)}
                    sendMessage={sendMessage}
                    onSettingsChange={handleStepperSettingsChange}
                  />
                );
              } else if (motor.type === "servo") {
                // Ensure all props for ServoMotorDisplay are passed
                const servoMotor = motor as ServoMotorDisplay;
                return (
                  <ServoCardHybrid
                    key={servoMotor.id}
                    id={servoMotor.id}
                    name={servoMotor.name}
                    angle={
                      (componentStates[servoMotor.id] as number) ??
                      servoMotor.angle
                    }
                    minAngle={servoMotor.minAngle}
                    maxAngle={servoMotor.maxAngle}
                    pins={servoMotor.pins}
                    initialPresets={servoMotor.initialPresets}
                    onDelete={() => handleDeleteMotor(servoMotor.id)}
                    onDuplicate={() => handleDuplicateMotor(servoMotor)}
                    onEditPins={() => handleEditPins(servoMotor)}
                    sendMessage={sendMessage}
                    onSettingsChange={handleServoSettingsChange}
                  />
                );
              } else if (motor.type === "iopin") {
                const ioPin = motor as IOPinDisplay;
                return (
                  <IOPinCard
                    key={ioPin.id}
                    id={ioPin.id}
                    name={ioPin.name}
                    pinNumber={ioPin.pinNumber}
                    mode={ioPin.mode}
                    type={ioPin.type}
                    value={(componentStates[ioPin.id] as number) ?? ioPin.value}
                    onDelete={() => handleDeleteMotor(ioPin.id)}
                    onDuplicate={() => handleDuplicateMotor(ioPin)}
                    onEditPin={() => handleEditPins(ioPin)}
                    sendMessage={sendMessage}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>

      <NewComponentDialog
        open={isNewMotorOpen}
        onOpenChange={setIsNewMotorOpen}
        onCreateComponent={(componentData) => {
          const newId = `${componentData.type}-${Date.now()}`;
          let componentGroup: keyof HardwareConfig;
          let newComponent: ConfiguredComponent;
          let configPayload: any = { id: newId, name: componentData.name };

          if (componentData.type === "stepper") {
            componentGroup = "steppers";
            const pins = [
              componentData.pins.step,
              componentData.pins.direction,
            ];
            if (componentData.pins.enable) pins.push(componentData.pins.enable);

            // Initialize new stepper with defaults for new fields
            newComponent = {
              id: newId,
              type: "Stepper", // This should match the type in HardwareConfig
              name: componentData.name,
              pins: pins,
              maxSpeed: 1000, // Default from card
              acceleration: 500, // Default from card
              stepsPerInch: 2000, // Default
              minPosition: -50000, // Default
              maxPosition: 50000, // Default
              jogUnit: "steps", // Default
              jogAmount: 200, // Default
              jogAmountInches: 0.1, // Default
            } as any; // Asserting because ConfiguredComponent might not have all fields yet

            configPayload.pulPin = componentData.pins.step;
            configPayload.dirPin = componentData.pins.direction;
            if (componentData.pins.enable)
              configPayload.enaPin = componentData.pins.enable;
            configPayload.maxSpeed = (newComponent as any).maxSpeed;
            configPayload.acceleration = (newComponent as any).acceleration;
            configPayload.stepsPerInch = (newComponent as any).stepsPerInch;
            configPayload.minPosition = (newComponent as any).minPosition;
            configPayload.maxPosition = (newComponent as any).maxPosition;
            configPayload.jogUnit = (newComponent as any).jogUnit;
            configPayload.jogAmount = (newComponent as any).jogAmount;
            configPayload.jogAmountInches = (
              newComponent as any
            ).jogAmountInches;
          } else if (componentData.type === "servo") {
            componentGroup = "servos";
            newComponent = {
              id: newId,
              type: "Servo", // This should match the type in HardwareConfig
              name: componentData.name,
              pins: [componentData.pins.control],
              minAngle: 0,
              maxAngle: 180,
              presets: [0, 45, 90, 135, 180], // Default presets
            } as any; // Asserting

            configPayload.pin = componentData.pins.control;
            configPayload.minAngle = (newComponent as any).minAngle;
            configPayload.maxAngle = (newComponent as any).maxAngle;
            configPayload.presets = (newComponent as any).presets;
          } else {
            // IO Pin
            componentGroup = "pins";
            newComponent = {
              id: newId,
              type: `${componentData.pins.type}_${componentData.pins.mode}`,
              name: componentData.name,
              pins: [componentData.pins.pin],
            };

            configPayload.pin = componentData.pins.pin;
            configPayload.mode = componentData.pins.mode;
            configPayload.pinType = componentData.pins.type;
          }

          setHardwareConfig((prev) => ({
            ...prev,
            [componentGroup]: [...prev[componentGroup], newComponent],
          }));

          sendMessage({
            action: "configure",
            componentGroup: componentGroup,
            config: configPayload,
          });

          setInfoMessage(
            `${
              componentData.type === "iopin" ? "IO Pin" : "Motor"
            } added. Remember to Save Configuration.`
          );
        }}
      />

      <Toaster />
    </div>
  );
}
