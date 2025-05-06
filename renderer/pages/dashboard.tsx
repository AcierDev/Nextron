"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlusCircle, ArrowLeft, Save, Loader2 } from "lucide-react";
import StepperCardDesign2 from "@/components/StepperCardDesign2";
import ServoCardHybrid from "@/components/ServoCardHybrid";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { motion, AnimatePresence } from "framer-motion";

// Import shared types
import {
  HardwareConfig,
  ConfiguredComponent,
  SavedConfigDocument,
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
};

type MotorDisplay = StepperMotorDisplay | ServoMotorDisplay;

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

  // Motor Dialog state (remains the same)
  const [isNewMotorOpen, setIsNewMotorOpen] = useState(false);
  const [newMotorType, setNewMotorType] = useState<"stepper" | "servo">(
    "stepper"
  );
  const [newMotorName, setNewMotorName] = useState("");
  const [newMotorPins, setNewMotorPins] = useState({
    step: 0,
    direction: 0,
    enable: 0,
    control: 0,
  });
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
        displayMotors.push({
          id: servo.id,
          type: "servo",
          name: servo.name,
          angle: 90,
          minAngle: servo.minAngle ?? 0,
          maxAngle: servo.maxAngle ?? 180,
          pins: { control: servo.pins[0] },
        });
      });

      hwConfig.steppers.forEach((stepper) => {
        displayMotors.push({
          id: stepper.id,
          type: "stepper",
          name: stepper.name,
          position: 0,
          speed: stepper.maxSpeed ?? 1000,
          acceleration: stepper.acceleration ?? 500,
          stepsPerInch: 200,
          minPosition: -50000,
          maxPosition: 50000,
          pins: {
            step: stepper.pins[0],
            direction: stepper.pins[1],
            enable: stepper.pins[2],
          },
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

          if (message.id !== undefined) {
            updateId = message.id;
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
                  ws.current.send(JSON.stringify({ action: "ping" }));
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
                const intervalId = pingInterval;
                // Use proper type assertion with null check
                (ws.current as EnhancedWebSocket).pingIntervalId = intervalId;
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
                clearInterval(wsWithPing.pingIntervalId);
                wsWithPing.pingIntervalId = undefined; // Clear the reference
              }
            } catch (error) {
              console.error("Error clearing ping interval on error:", error);
            }
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
                clearInterval(wsWithPing.pingIntervalId);
                wsWithPing.pingIntervalId = undefined; // Clear the reference
              }
            } catch (error) {
              console.error("Error clearing ping interval on close:", error);
            }
          }
          // Ensure ws.current is nullified on close regardless of previous state
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

    if (!group) {
      console.error(`Cannot delete motor ${id}: Not found in hardware config.`);
      setErrorMessage("Failed to find motor to delete.");
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

    setInfoMessage("Motor removed. Remember to Save Configuration.");
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
    }

    if (!originalComponent || !group) {
      console.error(
        `Cannot duplicate motor ${motorToDup.id}: Original not found.`
      );
      setErrorMessage("Failed to find original motor to duplicate.");
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
    }
    sendMessage({
      action: "configure",
      componentGroup: group,
      config: configPayload,
    });

    setInfoMessage("Motor duplicated. Remember to Save Configuration.");
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
    } else {
      setEditPins({
        step: 0,
        direction: 0,
        enable: 0,
        control: motor.pins.control,
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

    const group = editingMotor.type === "stepper" ? "steppers" : "servos";
    let pinsArray: number[];
    let updatedComponent: Partial<ConfiguredComponent> = { pins: [] };

    if (editingMotor.type === "stepper") {
      pinsArray = [editPins.step, editPins.direction];
      if (editPins.enable) pinsArray.push(editPins.enable);
      updatedComponent.pins = pinsArray;
    } else {
      pinsArray = [editPins.control];
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

  // Handle creating a new motor
  const handleCreateMotor = () => {
    if (!newMotorName.trim()) {
      toast({
        title: "Error",
        description: "Motor name cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    const id = `${newMotorType}-${Date.now()}`;
    let newComponentData: ConfiguredComponent;
    let group: keyof HardwareConfig;
    let configPayload: any = { id: id, name: newMotorName.trim() };

    if (newMotorType === "stepper") {
      group = "steppers";
      const pins = [newMotorPins.step, newMotorPins.direction];
      if (newMotorPins.enable) pins.push(newMotorPins.enable);
      newComponentData = {
        id,
        type: "Stepper",
        name: newMotorName.trim(),
        pins: pins,
        maxSpeed: 1000,
        acceleration: 500,
      };
      configPayload.pulPin = newMotorPins.step;
      configPayload.dirPin = newMotorPins.direction;
      if (newMotorPins.enable) configPayload.enaPin = newMotorPins.enable;
      configPayload.maxSpeed = 1000;
      configPayload.acceleration = 500;
    } else {
      group = "servos";
      newComponentData = {
        id,
        type: "Servo",
        name: newMotorName.trim(),
        pins: [newMotorPins.control],
        minAngle: 0,
        maxAngle: 180,
      };
      configPayload.pin = newMotorPins.control;
      configPayload.minAngle = 0;
      configPayload.maxAngle = 180;
    }

    setHardwareConfig((prev) => ({
      ...prev,
      [group]: [...prev[group], newComponentData],
    }));

    sendMessage({
      action: "configure",
      componentGroup: group,
      config: configPayload,
    });

    setNewMotorName("");
    setNewMotorPins({ step: 0, direction: 0, enable: 0, control: 0 });
    setNewMotorType("stepper");
    setIsNewMotorOpen(false);
    setInfoMessage("Motor added. Remember to Save Configuration.");
  };

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
    return () => {
      try {
        // Use the stored instance in cleanup
        if (wsInstance) {
          console.log("Closing WebSocket connection on component unmount");

          // Clear ping interval if it exists
          try {
            const wsWithPing = wsInstance as EnhancedWebSocket;
            if (wsWithPing.pingIntervalId) {
              clearInterval(wsWithPing.pingIntervalId);
              // No need to set wsWithPing.pingIntervalId = undefined here
              // as the instance itself is being discarded.
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
  }, []); // <-- CHANGE DEPENDENCY ARRAY TO EMPTY

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
                {/* Connection Status Display */}
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
              onClick={() => setIsNewMotorOpen(true)}
              disabled={isSaving}
            >
              <PlusCircle className="h-4 w-4" />
              Add Motor
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
              No Motors Added
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Add your first motor to this configuration
            </p>
            <Button onClick={() => setIsNewMotorOpen(true)} disabled={isSaving}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Motor
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {motors.map((motor) =>
              motor.type === "stepper" ? (
                <StepperCardDesign2
                  key={motor.id}
                  id={motor.id}
                  name={motor.name}
                  position={
                    (componentStates[motor.id] as number) ?? motor.position
                  }
                  speed={motor.speed}
                  acceleration={motor.acceleration}
                  stepsPerInch={motor.stepsPerInch}
                  minPosition={motor.minPosition}
                  maxPosition={motor.maxPosition}
                  pins={motor.pins}
                  onDelete={() => handleDeleteMotor(motor.id)}
                  onDuplicate={() => handleDuplicateMotor(motor)}
                  onEditPins={() => handleEditPins(motor)}
                  sendMessage={sendMessage}
                />
              ) : (
                <ServoCardHybrid
                  key={motor.id}
                  id={motor.id}
                  name={motor.name}
                  angle={(componentStates[motor.id] as number) ?? motor.angle}
                  minAngle={motor.minAngle}
                  maxAngle={motor.maxAngle}
                  pins={motor.pins}
                  onDelete={() => handleDeleteMotor(motor.id)}
                  onDuplicate={() => handleDuplicateMotor(motor)}
                  onEditPins={() => handleEditPins(motor)}
                  sendMessage={sendMessage}
                />
              )
            )}
          </div>
        )}
      </div>

      <Dialog open={isNewMotorOpen} onOpenChange={setIsNewMotorOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Add New Motor
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label
                htmlFor="motor-name"
                className="text-gray-700 dark:text-gray-300"
              >
                Motor Name
              </Label>
              <Input
                id="motor-name"
                value={newMotorName}
                onChange={(e) => setNewMotorName(e.target.value)}
                className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <Label className="mb-2 block text-gray-700 dark:text-gray-300">
                Motor Type
              </Label>
              <RadioGroup
                className="text-gray-700 dark:text-gray-300"
                value={newMotorType}
                onValueChange={(value: "stepper" | "servo") =>
                  setNewMotorType(value)
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="stepper" id="stepper" />
                  <Label htmlFor="stepper">Stepper Motor</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="servo" id="servo" />
                  <Label htmlFor="servo">Servo Motor</Label>
                </div>
              </RadioGroup>
            </div>

            {newMotorType === "stepper" ? (
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Pin Configuration
                </Label>
                <div className="grid grid-cols-3 gap-2">
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
                      value={newMotorPins.step}
                      onChange={(e) =>
                        setNewMotorPins({
                          ...newMotorPins,
                          step: Number(e.target.value),
                        })
                      }
                      className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
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
                      value={newMotorPins.direction}
                      onChange={(e) =>
                        setNewMotorPins({
                          ...newMotorPins,
                          direction: Number(e.target.value),
                        })
                      }
                      className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
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
                      value={newMotorPins.enable}
                      onChange={(e) =>
                        setNewMotorPins({
                          ...newMotorPins,
                          enable: Number(e.target.value),
                        })
                      }
                      placeholder="None"
                      className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Label
                  htmlFor="control-pin"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Control Pin
                </Label>
                <Input
                  id="control-pin"
                  type="number"
                  value={newMotorPins.control}
                  onChange={(e) =>
                    setNewMotorPins({
                      ...newMotorPins,
                      control: Number(e.target.value),
                    })
                  }
                  className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleCreateMotor} disabled={!newMotorName.trim()}>
              Create Motor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
