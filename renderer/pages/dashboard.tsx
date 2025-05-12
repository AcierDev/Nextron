"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlusCircle, ArrowLeft, Save, Loader2, PlaySquare } from "lucide-react";
import StepperCardDesign2 from "@/components/StepperCardDesign2";
import ServoCardHybrid from "@/components/ServoCardHybrid";
import IOPinCard from "@/components/IOPinCard";
import { NewComponentDialog } from "@/components/NewComponentDialog";
import { Toaster } from "@/components/ui/toaster";

// Import our Zustand stores
import {
  useConfigStore,
  useWSStore,
  ComponentDisplay,
  StepperMotorDisplay,
  ServoMotorDisplay,
  IOPinDisplay,
} from "@/lib/stores";

// Import shared types
import {
  HardwareConfig,
  ConfiguredComponent,
  AnyComponentConfig,
  StepperComponentConfig,
  ServoComponentConfig,
  IoPinComponentConfig,
} from "../../common/types";

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configId = searchParams.get("config");

  // Combined store state
  const {
    // Config state
    currentConfig,
    hardwareConfig,
    loadConfiguration,
    saveConfiguration,
    updateHardwareConfig,

    // Component state
    components,
    componentStates,
    isNewComponentDialogOpen,
    addComponent: addComponentToDisplay,
    removeComponent: removeComponentFromDisplay,
    duplicateComponent: duplicateComponentInDisplay,
    updateStepperSettings: updateStepperSettingsInDisplay,
    updateServoSettings: updateServoSettingsInDisplay,
    updateComponentState,
    setNewComponentDialogOpen,
    resetState: resetComponentState,

    // Messages
    errorMessage: configErrorMessage,
    infoMessage: configInfoMessage,
    setErrorMessage: setConfigErrorMessage,
    setInfoMessage: setConfigInfoMessage,
  } = useConfigStore();

  // WebSocket store for communication
  const {
    connectionStatus,
    lastIpOctet,
    errorMessage: wsErrorMessage,
    infoMessage: wsInfoMessage,
    sendMessage,
    setConnectionStatus: setWSConnectionStatus, // Renamed to avoid conflict
    setLastIpOctet: setWSLastIpOctet, // Renamed to avoid conflict
    setErrorMessage: setWSErrorMessage,
    setInfoMessage: setWSInfoMessage, // Renamed to avoid conflict
  } = useWSStore();

  // Reference to WebSocket for cleanup
  const ws = useRef<WebSocket | null>(null);

  // Get the effective error and info messages to display
  const errorMessage = configErrorMessage || wsErrorMessage;
  const infoMessage = configInfoMessage || wsInfoMessage;

  // --- EFFECTS --- //

  // Load configuration from IPC and reset states
  useEffect(() => {
    resetComponentState(); // Reset component store on config ID change
    if (!configId) {
      setConfigErrorMessage("No config ID provided in URL");
      router.push("/configurations");
      return;
    }

    async function loadAndSync() {
      try {
        // Load the configuration and check if we should sync
        const result = await loadConfiguration(configId);

        // If the config was loaded successfully and we're connected, sync with the device
        if (result.shouldSync && connectionStatus === "connected") {
          console.log(
            "Dashboard: Config loaded and connection active, performing initial sync"
          );
          useConfigStore.getState().syncConfigWithDevice(sendMessage);
        }
      } catch (error) {
        console.error("Error loading or syncing configuration:", error);
      }
    }

    loadAndSync();
  }, [
    configId,
    router,
    loadConfiguration,
    setConfigErrorMessage,
    resetComponentState,
    connectionStatus,
    sendMessage,
  ]);

  // Auto clear messages
  useEffect(() => {
    let errorTimer: NodeJS.Timeout | null = null;
    let infoTimer: NodeJS.Timeout | null = null;

    if (errorMessage) {
      errorTimer = setTimeout(() => {
        setConfigErrorMessage(null);
        setWSErrorMessage(null);
      }, 5000);
    }

    if (infoMessage) {
      infoTimer = setTimeout(() => {
        setConfigInfoMessage(null);
        setWSInfoMessage(null); // Clear WS info messages too
      }, 3000);
    }

    return () => {
      if (errorTimer) clearTimeout(errorTimer);
      if (infoTimer) clearTimeout(infoTimer);
    };
  }, [
    errorMessage,
    infoMessage,
    setConfigErrorMessage,
    setConfigInfoMessage,
    setWSErrorMessage,
    setWSInfoMessage,
  ]);

  // WebSocket listeners and connection check
  useEffect(() => {
    // Listen for WebSocket messages forwarded from the main process
    const wsMessageListener = window.ipc.on("ws-message", (message: string) => {
      console.log("Received WebSocket message from main process:", message);
      try {
        if (typeof message === "string" && message.startsWith("{")) {
          const data = JSON.parse(message);

          if (data.action === "pong") {
            console.debug("Received pong response:", data);
            return;
          }

          let updateId: string | null = null;
          let stateValue: number | boolean | string | undefined = undefined;

          if (data.id !== undefined) {
            updateId = data.id;
            if (data.value !== undefined || data.status !== undefined) {
              const customEvent = new CustomEvent("websocket-message", {
                detail: data,
              });
              window.dispatchEvent(customEvent);
            }
            if (data.state !== undefined) stateValue = data.state;
            else if (data.value !== undefined) stateValue = data.value;
            else if (data.position !== undefined) stateValue = data.position;
            else if (data.angle !== undefined) stateValue = data.angle;
          }

          if (updateId !== null && stateValue !== undefined) {
            console.log(
              `Updating state for ${
                data.type ?? "component"
              } ${updateId}: ${stateValue}`
            );
            updateComponentState(updateId, stateValue);
          }
        } else if (typeof message === "string") {
          console.log("Received text message from ESP32:", message);
          if (message.startsWith("ERROR:")) {
            setWSErrorMessage(message);
          }
        }
      } catch (error) {
        console.error("Failed to process WebSocket message:", message, error);
        setWSErrorMessage("Error processing message from device.");
      }
    });

    // Listen for WebSocket status changes from the main process
    const wsStatusListener = window.ipc.on("ws-status", (data: any) => {
      console.log("WebSocket status update from main:", data);
      if (data.status) {
        setWSConnectionStatus(data.status);
      }
      if (data.ipOctet) {
        setWSLastIpOctet(data.ipOctet);
      }
      if (data.error) {
        setWSErrorMessage(`Connection error: ${data.error}`);
      }
      if (data.status === "disconnected") {
        setWSErrorMessage("Disconnected from board. Please reconnect.");
      }
    });

    // Check connection status and sync on load
    const checkConnectionAndSync = async () => {
      try {
        const connectionData = await window.ipc.invoke("get-connection-status");
        console.log("Initial Connection status check:", connectionData);

        if (connectionData && connectionData.connected) {
          setWSConnectionStatus("connected");
          setWSLastIpOctet(connectionData.ipOctet || "");
          window.ipc.invoke("keep-connection-alive");

          // Sync is now handled by the configStore when loading a configuration
        } else if (connectionData && connectionData.stale) {
          setWSConnectionStatus("error");
          setWSLastIpOctet(connectionData.ipOctet || "");
          setWSErrorMessage("Connection may be stale. Please reconnect.");
        } else {
          setWSConnectionStatus("idle");
          if (currentConfig.isLoaded) {
            setConfigInfoMessage("Please connect to a board first");
            setTimeout(() => router.push("/connection"), 2000);
          }
        }
      } catch (err) {
        console.error("Error checking connection status:", err);
        setWSConnectionStatus("error");
        setWSErrorMessage("Failed to check connection status.");
      }
    };

    if (currentConfig.isLoaded) {
      checkConnectionAndSync();
    }

    // Set up keep-alive interval for main process connection state
    const keepAliveInterval = setInterval(() => {
      if (connectionStatus === "connected") {
        window.ipc.invoke("keep-connection-alive").catch((err) => {
          console.error("Failed to send keep-alive:", err);
        });
      }
    }, 60000);

    // Cleanup function
    return () => {
      if (wsMessageListener) wsMessageListener();
      if (wsStatusListener) wsStatusListener();
      clearInterval(keepAliveInterval);
    };
  }, [
    router,
    connectionStatus, // Re-evaluate if connection status changes
    updateComponentState,
    setWSErrorMessage,
    setConfigInfoMessage,
    setWSConnectionStatus,
    setWSLastIpOctet,
    currentConfig.isLoaded, // Re-evaluate when config is loaded
    sendMessage, // Need sendMessage for syncConfigWithDevice
  ]);

  // Add WebSocket cleanup effect
  useEffect(() => {
    // Store the current ws ref to use in the cleanup function
    const wsInstance = ws.current;

    return () => {
      if (wsInstance) {
        // Clean up WebSocket connection
        try {
          wsInstance.onopen = null;
          wsInstance.onmessage = null;
          wsInstance.onclose = null;
          wsInstance.onerror = null;

          if (
            wsInstance.readyState === WebSocket.OPEN ||
            wsInstance.readyState === WebSocket.CONNECTING
          ) {
            wsInstance.close();
          }
        } catch (err) {
          console.error("Error during WebSocket cleanup:", err);
        }
      }

      // Stop IP watch process if active
      try {
        window.ipc.send("stop-ip-watch", {});
      } catch (err) {
        console.error("Error stopping IP watch during unmount:", err);
      }
    };
  }, []); // Empty dependency array for mount/unmount only

  // --- HANDLERS --- //

  // Handle component deletion
  const handleDeleteComponent = (id: string) => {
    const component = components.find((c) => c.id === id);
    if (!component) {
      setConfigErrorMessage(`Cannot delete component ${id}: Not found.`);
      return;
    }

    let componentGroup: string;
    if (component.type === "servo") componentGroup = "servos";
    else if (component.type === "stepper") componentGroup = "steppers";
    else componentGroup = "pins";

    console.log(`Requesting removal of ${componentGroup} with id ${id}`);
    sendMessage({ action: "remove", componentGroup, id });

    // Update local display state
    removeComponentFromDisplay(id);

    // Update the hardwareConfig in the config store
    const updatedHardware = { ...hardwareConfig };
    updatedHardware[componentGroup as keyof HardwareConfig] = updatedHardware[
      componentGroup as keyof HardwareConfig
    ].filter((comp) => comp.id !== id);
    updateHardwareConfig(updatedHardware);

    setConfigInfoMessage("Component removed. Remember to Save Configuration.");
  };

  // Handle component duplication
  const handleDuplicateComponent = (id: string) => {
    const componentToDuplicate = components.find((c) => c.id === id);
    if (!componentToDuplicate) {
      setConfigErrorMessage("Failed to find original component to duplicate.");
      return;
    }

    const newId = `${componentToDuplicate.type}-${Date.now()}`;
    const newName = `${componentToDuplicate.name} (Copy)`;

    let originalConfigComponent: ConfiguredComponent | undefined;
    let componentGroup: keyof HardwareConfig;

    if (componentToDuplicate.type === "stepper") {
      componentGroup = "steppers";
      originalConfigComponent = hardwareConfig.steppers.find(
        (c) => c.id === id
      );
    } else if (componentToDuplicate.type === "servo") {
      componentGroup = "servos";
      originalConfigComponent = hardwareConfig.servos.find((c) => c.id === id);
    } else {
      componentGroup = "pins";
      originalConfigComponent = hardwareConfig.pins.find((c) => c.id === id);
    }

    if (!originalConfigComponent) {
      setConfigErrorMessage(
        "Failed to find original hardware config for duplication."
      );
      return;
    }

    const duplicatedConfigComponent: ConfiguredComponent = {
      ...originalConfigComponent,
      id: newId,
      name: newName,
    };

    // Update hardware config in the config store
    const updatedHardware = { ...hardwareConfig };
    updatedHardware[componentGroup] = [
      ...updatedHardware[componentGroup],
      duplicatedConfigComponent,
    ];
    updateHardwareConfig(updatedHardware);

    // Update display state (will be recalculated from hardwareConfig, but do it immediately for UI)
    duplicateComponentInDisplay(id);

    // Send configure message for the new component
    let configPayload: any = { id: newId, name: newName };
    // Populate configPayload based on type (same as in NewComponentDialog handler)
    if (componentGroup === "servos") {
      configPayload.pin = duplicatedConfigComponent.pins[0];
      configPayload.minAngle = duplicatedConfigComponent.minAngle ?? 0;
      configPayload.maxAngle = duplicatedConfigComponent.maxAngle ?? 180;
    } else if (componentGroup === "steppers") {
      configPayload.pulPin = duplicatedConfigComponent.pins[0];
      configPayload.dirPin = duplicatedConfigComponent.pins[1];
      if (
        duplicatedConfigComponent.pins.length > 2 &&
        duplicatedConfigComponent.pins[2] != null
      )
        configPayload.enaPin = duplicatedConfigComponent.pins[2];
      configPayload.maxSpeed = duplicatedConfigComponent.maxSpeed ?? 1000;
      configPayload.acceleration =
        duplicatedConfigComponent.acceleration ?? 500;
    } else if (componentGroup === "pins") {
      configPayload.pin = duplicatedConfigComponent.pins[0];
      const typeParts = duplicatedConfigComponent.type.split("_"); // Assuming format like "digital_output"
      if (typeParts.length === 2) {
        configPayload.pinType = typeParts[0];
        configPayload.mode = typeParts[1];
      }
      configPayload.pullMode = duplicatedConfigComponent.pullMode;
      configPayload.debounceMs = duplicatedConfigComponent.debounceMs;
    }
    sendMessage({ action: "configure", componentGroup, config: configPayload });

    setConfigInfoMessage(
      "Component duplicated. Remember to Save Configuration."
    );
  };

  // Handle settings changes from cards
  const handleStepperSettingsChange = (
    motorId: string,
    newSettings: Partial<StepperMotorDisplay> // Input is display type
  ) => {
    updateStepperSettingsInDisplay(motorId, newSettings);

    const originalStepperConfig = hardwareConfig.steppers.find(
      (s) => s.id === motorId
    );
    if (!originalStepperConfig) {
      console.error(
        `[Dashboard] Cannot find original stepper config for ID ${motorId} to send update.`
      );
      setConfigErrorMessage(
        `Error updating stepper ${motorId}: Original config not found.`
      );
      return;
    }

    const updatedHardware = { ...hardwareConfig };
    updatedHardware.steppers = updatedHardware.steppers.map((stepperConfig) => {
      if (stepperConfig.id === motorId) {
        const configUpdate: Partial<ConfiguredComponent> = {};
        if (newSettings.name !== undefined)
          configUpdate.name = newSettings.name;
        if (newSettings.minPosition !== undefined)
          configUpdate.minPosition = newSettings.minPosition;
        if (newSettings.maxPosition !== undefined)
          configUpdate.maxPosition = newSettings.maxPosition;
        if (newSettings.stepsPerInch !== undefined)
          configUpdate.stepsPerInch = newSettings.stepsPerInch;
        if (newSettings.speed !== undefined)
          configUpdate.maxSpeed = newSettings.speed;
        if (newSettings.acceleration !== undefined)
          configUpdate.acceleration = newSettings.acceleration;
        if (newSettings.initialJogUnit !== undefined)
          configUpdate.jogUnit = newSettings.initialJogUnit;
        if (newSettings.initialJogAmount !== undefined)
          configUpdate.jogAmount = newSettings.initialJogAmount;
        if (newSettings.initialJogAmountInches !== undefined)
          configUpdate.jogAmountInches = newSettings.initialJogAmountInches;
        if (newSettings.initialHomeSensorId !== undefined)
          configUpdate.homeSensorId = newSettings.initialHomeSensorId;
        if (newSettings.initialHomingDirection !== undefined)
          configUpdate.homingDirection = newSettings.initialHomingDirection;
        if (newSettings.initialHomingSpeed !== undefined)
          configUpdate.homingSpeed = newSettings.initialHomingSpeed;
        if (newSettings.initialHomeSensorPinActiveState !== undefined)
          configUpdate.homeSensorPinActiveState =
            newSettings.initialHomeSensorPinActiveState;
        if (newSettings.initialHomePositionOffset !== undefined)
          configUpdate.homePositionOffset =
            newSettings.initialHomePositionOffset;

        return { ...stepperConfig, ...configUpdate };
      }
      return stepperConfig;
    });
    updateHardwareConfig({ steppers: updatedHardware.steppers });

    const configUpdatePayload: any = {
      id: motorId,
      name: originalStepperConfig.name,
      pulPin: originalStepperConfig.pins[0],
      dirPin: originalStepperConfig.pins[1],
    };
    if (
      originalStepperConfig.pins.length > 2 &&
      originalStepperConfig.pins[2] != null
    ) {
      configUpdatePayload.enaPin = originalStepperConfig.pins[2];
    }

    let changesMade = false;
    if (newSettings.minPosition !== undefined) {
      configUpdatePayload.minPosition = newSettings.minPosition;
      changesMade = true;
    }
    if (newSettings.maxPosition !== undefined) {
      configUpdatePayload.maxPosition = newSettings.maxPosition;
      changesMade = true;
    }
    if (newSettings.stepsPerInch !== undefined) {
      configUpdatePayload.stepsPerInch = newSettings.stepsPerInch;
      changesMade = true;
    }
    if (newSettings.speed !== undefined) {
      configUpdatePayload.maxSpeed = newSettings.speed;
      changesMade = true;
    }
    if (newSettings.acceleration !== undefined) {
      configUpdatePayload.acceleration = newSettings.acceleration;
      changesMade = true;
    }
    if (newSettings.initialHomeSensorId !== undefined) {
      configUpdatePayload.homeSensorId = newSettings.initialHomeSensorId;
      changesMade = true;
    }
    if (newSettings.initialHomingDirection !== undefined) {
      configUpdatePayload.homingDirection = newSettings.initialHomingDirection;
      changesMade = true;
    }
    if (newSettings.initialHomingSpeed !== undefined) {
      configUpdatePayload.homingSpeed = newSettings.initialHomingSpeed;
      changesMade = true;
    }
    if (newSettings.initialHomeSensorPinActiveState !== undefined) {
      configUpdatePayload.homeSensorPinActiveState =
        newSettings.initialHomeSensorPinActiveState;
      changesMade = true;
    }
    if (newSettings.initialHomePositionOffset !== undefined) {
      configUpdatePayload.homePositionOffset =
        newSettings.initialHomePositionOffset;
      changesMade = true;
    }
    // Jog settings are usually local to UI and don't need to be sent as part of stepper 'configure' to firmware

    if (changesMade) {
      // Always include both speed and acceleration in the configuration update
      // to prevent one from reverting to default when the other is updated
      if (!configUpdatePayload.hasOwnProperty("maxSpeed")) {
        const stepperComponent = components.find(
          (c) => c.id === motorId && c.type === "stepper"
        ) as StepperMotorDisplay | undefined;
        if (stepperComponent?.speed !== undefined) {
          configUpdatePayload.maxSpeed = stepperComponent.speed;
        }
      }

      if (!configUpdatePayload.hasOwnProperty("acceleration")) {
        const stepperComponent = components.find(
          (c) => c.id === motorId && c.type === "stepper"
        ) as StepperMotorDisplay | undefined;
        if (stepperComponent?.acceleration !== undefined) {
          configUpdatePayload.acceleration = stepperComponent.acceleration;
        }
      }

      // If any homing setting is being updated, include all homing settings to prevent losing configuration
      const isHomingSettingUpdated =
        newSettings.initialHomeSensorId !== undefined ||
        newSettings.initialHomingDirection !== undefined ||
        newSettings.initialHomingSpeed !== undefined ||
        newSettings.initialHomeSensorPinActiveState !== undefined ||
        newSettings.initialHomePositionOffset !== undefined;

      if (isHomingSettingUpdated) {
        // Get the current stepper component with all its settings
        const stepperComponent = components.find(
          (c) => c.id === motorId && c.type === "stepper"
        ) as StepperMotorDisplay | undefined;

        if (stepperComponent) {
          // Include all homing settings from the component
          if (!configUpdatePayload.hasOwnProperty("homeSensorId")) {
            configUpdatePayload.homeSensorId =
              stepperComponent.initialHomeSensorId || null;
          }
          if (!configUpdatePayload.hasOwnProperty("homingDirection")) {
            configUpdatePayload.homingDirection =
              stepperComponent.initialHomingDirection || 1;
          }
          if (!configUpdatePayload.hasOwnProperty("homingSpeed")) {
            configUpdatePayload.homingSpeed =
              stepperComponent.initialHomingSpeed || 1000;
          }
          if (!configUpdatePayload.hasOwnProperty("homeSensorPinActiveState")) {
            configUpdatePayload.homeSensorPinActiveState =
              stepperComponent.initialHomeSensorPinActiveState || 0;
          }
          if (!configUpdatePayload.hasOwnProperty("homePositionOffset")) {
            configUpdatePayload.homePositionOffset =
              stepperComponent.initialHomePositionOffset || 0;
          }
        }
      }

      console.log(
        `[Dashboard] Sending stepper configure update for ${motorId}:`,
        configUpdatePayload
      );
      sendMessage({
        action: "configure",
        componentGroup: "steppers",
        config: configUpdatePayload,
      });
    }
  };

  const handleServoSettingsChange = (
    servoId: string,
    newSettings: Partial<ServoMotorDisplay> // Input is display type
  ) => {
    updateServoSettingsInDisplay(servoId, newSettings);

    // Find the full original config from the store to get required fields
    const originalServoConfig = hardwareConfig.servos.find(
      (s) => s.id === servoId
    );
    if (!originalServoConfig) {
      console.error(
        `[Dashboard] Cannot find original servo config for ID ${servoId} to send update.`
      );
      setConfigErrorMessage(
        `Error updating servo ${servoId}: Original config not found.`
      );
      return;
    }

    const updatedHardware = { ...hardwareConfig };
    updatedHardware.servos = updatedHardware.servos.map((servoConfig) => {
      if (servoConfig.id === servoId) {
        const configUpdate: Partial<ConfiguredComponent> = {};
        if (newSettings.name !== undefined)
          configUpdate.name = newSettings.name;
        if (newSettings.minAngle !== undefined)
          configUpdate.minAngle = newSettings.minAngle;
        if (newSettings.maxAngle !== undefined)
          configUpdate.maxAngle = newSettings.maxAngle;
        if (newSettings.initialPresets !== undefined)
          configUpdate.presets = newSettings.initialPresets;
        if (newSettings.initialSpeed !== undefined)
          configUpdate.speed = newSettings.initialSpeed;

        return { ...servoConfig, ...configUpdate };
      }
      return servoConfig;
    });
    updateHardwareConfig({ servos: updatedHardware.servos });

    // Send configure message for relevant changes, ensuring required fields are present
    const configUpdatePayload: any = {
      id: servoId,
      name: originalServoConfig.name, // Always include name
      pin: originalServoConfig.pins[0], // Always include pin
    };
    if (newSettings.minAngle !== undefined)
      configUpdatePayload.minAngle = newSettings.minAngle;
    if (newSettings.maxAngle !== undefined)
      configUpdatePayload.maxAngle = newSettings.maxAngle;
    if (newSettings.initialPresets !== undefined)
      configUpdatePayload.presets = newSettings.initialPresets;
    // Speed is usually handled by control message, but include if needed
    // if (newSettings.initialSpeed !== undefined) configUpdatePayload.speed = newSettings.initialSpeed;

    // Only send if there are actual changes beyond the required fields
    const changesMade = Object.keys(newSettings).some(
      (key) =>
        key === "minAngle" || key === "maxAngle" || key === "initialPresets" // Add other relevant keys if needed
    );

    if (changesMade) {
      console.log(
        `[Dashboard] Sending servo configure update for ${servoId}:`,
        configUpdatePayload
      );
      sendMessage({
        action: "configure",
        componentGroup: "servos",
        config: configUpdatePayload,
      });
    }
  };

  // Handle IO Pin settings changes
  const handleIoPinSettingsChange = (
    pullMode: number,
    debounceMs: number,
    pinId: string
  ) => {
    console.log(
      `[Dashboard] Updating hardware config for pin ${pinId}: pullMode=${pullMode}, debounceMs=${debounceMs}`
    );

    // Find the pin in hardware config
    const pin = hardwareConfig.pins.find((p) => p.id === pinId);
    if (!pin) {
      console.error(
        `[Dashboard] Pin with ID ${pinId} not found in hardware config`
      );
      return;
    }

    // Find and update the pin in the hardware config
    const updatedPins = hardwareConfig.pins.map((pin) => {
      if (pin.id === pinId) {
        return {
          ...pin,
          pullMode,
          debounceMs,
        };
      }
      return pin;
    });

    // Update the hardware config state
    updateHardwareConfig({ pins: updatedPins });

    // Now send the configuration to the device
    const configUpdatePayload = {
      id: pinId,
      name: pin.name,
      pin: pin.pins[0],
      mode: pin.type.includes("input") ? "input" : "output",
      pinType: pin.type.startsWith("digital")
        ? "digital"
        : pin.type.startsWith("analog")
        ? "analog"
        : "pwm",
      pullMode,
      debounceMs,
    };

    console.log(
      `[Dashboard] Sending pin configure update for ${pinId}:`,
      configUpdatePayload
    );
    sendMessage({
      action: "configure",
      componentGroup: "pins",
      config: configUpdatePayload,
    });
  };

  // Handle saving the configuration
  const handleSaveConfiguration = async () => {
    setConfigInfoMessage("Saving configuration...");
    await saveConfiguration(); // This now reads hardwareConfig from the store
  };

  // --- RENDER METHODS --- //

  if (currentConfig.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
        <p className="ml-4 text-white text-lg">Loading Configuration...</p>
      </div>
    );
  }

  if (!currentConfig.id && errorMessage) {
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

  if (!currentConfig.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>No configuration loaded or error occurred.</p>
        <Button onClick={() => router.push("/configurations")} className="ml-4">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex flex-col">
      {/* Header notification for connection status */}
      {connectionStatus !== "connected" && (
        <div className="bg-yellow-500 text-black p-2 text-center">
          <p>
            No connection to board.{" "}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/connection")}
              className="ml-2 bg-white/90 hover:bg-white dark:bg-white/90 dark:hover:bg-white dark:text-black"
            >
              Connect to Board
            </Button>
          </p>
        </div>
      )}

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
                title={currentConfig.name || ""}
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
                  {connectionStatus === "connected"
                    ? "Connected"
                    : connectionStatus === "connecting"
                    ? "Connecting..."
                    : "Disconnected"}
                </span>
                {connectionStatus === "connected" &&
                  ` (192.168.1.${lastIpOctet})`}
                {connectionStatus === "connecting" && (
                  <Loader2 className="inline-block h-4 w-4 animate-spin ml-1" />
                )}
                {connectionStatus !== "connected" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={() => router.push("/connection")}
                  >
                    Connect to Board
                  </Button>
                )}
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
              onClick={() => setNewComponentDialogOpen(true)}
              disabled={currentConfig.isSaving}
            >
              <PlusCircle className="h-4 w-4" />
              Add Component
            </Button>
            <Button
              className="flex items-center gap-2"
              onClick={handleSaveConfiguration}
              disabled={currentConfig.isSaving}
            >
              {currentConfig.isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {currentConfig.isSaving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </header>

        {/* Display Error/Info messages */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm border border-red-200 dark:border-red-700/50">
            {errorMessage}
          </div>
        )}
        {infoMessage && (
          <div className="mb-4 p-3 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm border border-blue-200 dark:border-blue-700/50">
            {infoMessage}
          </div>
        )}

        {components.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
              No Components Added
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Add your first component to this configuration
            </p>
            <Button
              onClick={() => setNewComponentDialogOpen(true)}
              disabled={currentConfig.isSaving}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Component
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {components.map((component) => {
              if (component.type === "stepper") {
                const stepperMotor = component as StepperMotorDisplay;
                const availableIoPinsForStepper = hardwareConfig.pins
                  .filter((p) => p.type.includes("input"))
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    pin: p.pins[0],
                    pinMode: p.type.includes("input") ? "input" : "output",
                    pinType: p.type.startsWith("digital")
                      ? "digital"
                      : p.type.startsWith("analog")
                      ? "analog"
                      : p.type.startsWith("pwm")
                      ? "pwm"
                      : "digital",
                  }));

                return (
                  <StepperCardDesign2
                    key={stepperMotor.id}
                    id={stepperMotor.id}
                    name={stepperMotor.name}
                    position={
                      (componentStates[stepperMotor.id] as number) ??
                      stepperMotor.position
                    }
                    availableIoPins={availableIoPinsForStepper}
                    speed={stepperMotor.speed}
                    acceleration={stepperMotor.acceleration}
                    stepsPerInch={stepperMotor.stepsPerInch}
                    minPosition={stepperMotor.minPosition}
                    maxPosition={stepperMotor.maxPosition}
                    pins={stepperMotor.pins}
                    initialJogUnit={stepperMotor.initialJogUnit}
                    initialJogAmount={stepperMotor.initialJogAmount}
                    initialJogAmountInches={stepperMotor.initialJogAmountInches}
                    initialHomeSensorId={stepperMotor.initialHomeSensorId}
                    initialHomingDirection={stepperMotor.initialHomingDirection}
                    initialHomingSpeed={stepperMotor.initialHomingSpeed}
                    initialHomeSensorPinActiveState={
                      stepperMotor.initialHomeSensorPinActiveState
                    }
                    initialHomePositionOffset={
                      stepperMotor.initialHomePositionOffset
                    }
                    onDelete={() => handleDeleteComponent(stepperMotor.id)}
                    onDuplicate={() =>
                      handleDuplicateComponent(stepperMotor.id)
                    }
                    onEditPins={() =>
                      console.log(`Edit pins for ${stepperMotor.id}`)
                    }
                    sendMessage={sendMessage}
                    onSettingsChange={handleStepperSettingsChange}
                  />
                );
              } else if (component.type === "servo") {
                const servoMotor = component as ServoMotorDisplay;
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
                    initialSpeed={servoMotor.initialSpeed}
                    onDelete={() => handleDeleteComponent(servoMotor.id)}
                    onDuplicate={() => handleDuplicateComponent(servoMotor.id)}
                    onEditPins={() =>
                      console.log(`Edit pins for ${servoMotor.id}`)
                    }
                    sendMessage={sendMessage}
                    onSettingsChange={handleServoSettingsChange}
                  />
                );
              } else if (component.type === "digital") {
                const ioPin = component as IOPinDisplay;

                return (
                  <IOPinCard
                    key={ioPin.id}
                    id={ioPin.id}
                    name={ioPin.name}
                    pinNumber={ioPin.pinNumber}
                    mode={ioPin.mode}
                    type={ioPin.pinType ?? "digital"} // Provide default if undefined
                    value={
                      (componentStates[ioPin.id] as number) ?? ioPin.value ?? 0
                    } // Provide default if undefined
                    onDelete={() => handleDeleteComponent(ioPin.id)}
                    onDuplicate={() => handleDuplicateComponent(ioPin.id)}
                    onEditPin={() => console.log(`Edit pin for ${ioPin.id}`)}
                    sendMessage={sendMessage}
                    initialPullMode={ioPin.pullMode}
                    initialDebounceMs={ioPin.debounceMs}
                    onSettingsChange={handleIoPinSettingsChange}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>

      <NewComponentDialog
        open={isNewComponentDialogOpen}
        onOpenChange={setNewComponentDialogOpen}
        onCreateComponent={(componentData) => {
          // Use the configStore's createComponent method
          useConfigStore.getState().createComponent(componentData, sendMessage);
        }}
      />

      <Toaster />
    </div>
  );
}
