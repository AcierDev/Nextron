"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Upload,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Wifi,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function FirmwareSetupPage() {
  const router = useRouter();
  const [serialPorts, setSerialPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [status, setStatus] = useState("idle"); // idle, loading, success, error, detecting
  const [message, setMessage] = useState("");
  const [uploadStage, setUploadStage] = useState("preparing"); // preparing, connecting, erasing, uploading, verifying, completed
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLog, setUploadLog] = useState([]);

  // Fetch available serial ports when the component mounts
  useEffect(() => {
    const fetchPorts = async () => {
      try {
        // @ts-ignore - Global electron object
        const ports = await window.electron.getSerialPorts();
        console.log("ports", ports);

        // Filter out debug console and Bluetooth ports that aren't ESP32 devices
        const filteredPorts = ports.filter((port) => {
          // Skip debug console and Bluetooth-Incoming-Port
          if (
            port.path.includes("debug-console") ||
            port.path.includes("Bluetooth-Incoming-Port")
          ) {
            return false;
          }

          // Look for likely ESP32 indicators
          const isLikelyESP32 =
            (port.manufacturer &&
              (port.manufacturer.includes("Silicon") ||
                port.manufacturer.includes("Espressif") ||
                port.manufacturer.includes("CP210"))) ||
            port.path.includes("usbserial") ||
            port.path.includes("ttyUSB") ||
            port.path.includes("COM");

          return isLikelyESP32;
        });

        setSerialPorts(filteredPorts);
        if (filteredPorts.length > 0) {
          setSelectedPort(filteredPorts[0].path);
        }
      } catch (error) {
        console.error("Failed to get serial ports:", error);
        setMessage(
          "Failed to detect serial ports. Make sure you have the necessary drivers installed."
        );
        setStatus("error");
      }
    };

    fetchPorts();
  }, []);

  // Set up listener for firmware progress events
  useEffect(() => {
    const handleFirmwareProgress = (event: CustomEvent<string>) => {
      const output = event.detail;
      parseOutput(output);
    };

    // Add event listener
    document.addEventListener(
      "firmware-progress",
      handleFirmwareProgress as EventListener
    );

    // Cleanup
    return () => {
      document.removeEventListener(
        "firmware-progress",
        handleFirmwareProgress as EventListener
      );
    };
  }, []);

  const handleSkip = () => {
    router.push("/connection");
  };

  // Parse PlatformIO output to update UI accordingly
  const parseOutput = (output) => {
    // Split output by lines and process each line
    const lines = output.split(/\r?\n/).filter((line) => line.trim());

    lines.forEach((line) => {
      if (line.trim()) {
        // Only store the most recent line for display
        setUploadLog([line]);

        // Update the upload stage and progress based on the line content
        if (line.includes("Configuring upload protocol")) {
          setUploadStage("preparing");
          setUploadProgress(1);
        } else if (line.includes("AVAILABLE:") || line.includes("CURRENT:")) {
          setUploadStage("preparing");
          setUploadProgress(2);
        } else if (line.includes("Looking for upload port")) {
          setUploadStage("preparing");
          setUploadProgress(3);
        } else if (line.includes("Using manually specified:")) {
          setUploadStage("preparing");
          setUploadProgress(4);
        } else if (line.includes("Uploading .pio/build")) {
          setUploadStage("preparing");
          setUploadProgress(5);
        } else if (line.includes("esptool.py")) {
          setUploadStage("preparing");
          setUploadProgress(6);
        } else if (line.includes("Serial port")) {
          setUploadStage("preparing");
          setUploadProgress(7);
        } else if (line.includes("Connecting")) {
          setUploadStage("connecting");
          setUploadProgress(8);
        } else if (line.includes("Chip is ESP32")) {
          setUploadStage("connecting");
          setUploadProgress(10);
        } else if (line.includes("Uploading stub")) {
          setUploadStage("connecting");
          setUploadProgress(12);
        } else if (line.includes("Running stub")) {
          setUploadStage("connecting");
          setUploadProgress(14);
        } else if (line.includes("Stub running")) {
          setUploadStage("connecting");
          setUploadProgress(15);
        } else if (line.includes("Changing baud rate")) {
          setUploadStage("connecting");
          setUploadProgress(16);
        } else if (line.includes("Changed")) {
          setUploadStage("connecting");
          setUploadProgress(17);
        } else if (line.includes("Configuring flash size")) {
          setUploadStage("erasing");
          setUploadProgress(18);
        } else if (line.includes("Flash will be erased")) {
          setUploadStage("erasing");
          setUploadProgress(20);
        } else if (
          line.includes("Compressed") &&
          !line.includes("Writing at")
        ) {
          setUploadStage("uploading");
          setUploadProgress(22);
        } else if (line.includes("Writing at 0x00001000")) {
          // First binary segment (bootloader)
          setUploadStage("uploading");

          // Extract percentage if available
          const percentMatch = line.match(/\((\d+) %\)/);
          if (percentMatch && percentMatch[1]) {
            const percent = parseInt(percentMatch[1]);
            // Map bootloader 0-100 to 22-25 of total progress
            const mappedPercent = 22 + percent * 0.03;
            setUploadProgress(mappedPercent);
          }
        } else if (
          line.includes("Wrote 17536 bytes") ||
          (line.includes("Wrote") && line.includes("0x00001000"))
        ) {
          setUploadProgress(25);
        } else if (line.includes("Writing at 0x00008000")) {
          // Second binary segment (partition table)
          setUploadStage("uploading");

          const percentMatch = line.match(/\((\d+) %\)/);
          if (percentMatch && percentMatch[1]) {
            const percent = parseInt(percentMatch[1]);
            // Map partition table 0-100 to 25-28 of total progress
            const mappedPercent = 25 + percent * 0.03;
            setUploadProgress(mappedPercent);
          }
        } else if (line.includes("Wrote") && line.includes("0x00008000")) {
          setUploadProgress(28);
        } else if (line.includes("Writing at 0x0000e000")) {
          // Third binary segment (boot parameters)
          setUploadStage("uploading");

          const percentMatch = line.match(/\((\d+) %\)/);
          if (percentMatch && percentMatch[1]) {
            const percent = parseInt(percentMatch[1]);
            // Map boot parameters 0-100 to 28-30 of total progress
            const mappedPercent = 28 + percent * 0.02;
            setUploadProgress(mappedPercent);
          }
        } else if (line.includes("Wrote") && line.includes("0x0000e000")) {
          setUploadProgress(30);
        } else if (
          line.includes("Writing at 0x00010000") ||
          line.includes("Writing at 0x00010000... (2 %)")
        ) {
          // Main firmware binary - beginning
          setUploadStage("uploading");
          setUploadProgress(32);
        } else if (line.match(/Writing at 0x0001[0-9a-f]{4}... \((\d+) %\)/)) {
          // Extract percentage for main firmware
          const percentMatch = line.match(/\((\d+) %\)/);
          if (percentMatch && percentMatch[1]) {
            const percent = parseInt(percentMatch[1]);
            // Map main firmware 0-100 to 32-95 of total progress
            const mappedPercent = 32 + percent * 0.63;
            setUploadProgress(mappedPercent);
          }
        } else if (line.match(/Writing at 0x0002[0-9a-f]{4}/)) {
          setUploadProgress(38);
        } else if (line.match(/Writing at 0x0003[0-9a-f]{4}/)) {
          setUploadProgress(44);
        } else if (line.match(/Writing at 0x0004[0-9a-f]{4}/)) {
          setUploadProgress(50);
        } else if (line.match(/Writing at 0x0005[0-9a-f]{4}/)) {
          setUploadProgress(56);
        } else if (line.match(/Writing at 0x0006[0-9a-f]{4}/)) {
          setUploadProgress(62);
        } else if (line.match(/Writing at 0x0007[0-9a-f]{4}/)) {
          setUploadProgress(68);
        } else if (line.match(/Writing at 0x0008[0-9a-f]{4}/)) {
          setUploadProgress(74);
        } else if (line.match(/Writing at 0x0009[0-9a-f]{4}/)) {
          setUploadProgress(80);
        } else if (line.match(/Writing at 0x000a[0-9a-f]{4}/)) {
          setUploadProgress(84);
        } else if (line.match(/Writing at 0x000b[0-9a-f]{4}/)) {
          setUploadProgress(88);
        } else if (line.match(/Writing at 0x000c[0-9a-f]{4}/)) {
          setUploadProgress(90);
        } else if (line.match(/Writing at 0x000d[0-9a-f]{4}/)) {
          setUploadProgress(92);
        } else if (line.match(/Writing at 0x000[e-f][0-9a-f]{4}/)) {
          setUploadProgress(94);
        } else if (
          line.includes("Wrote 859104 bytes") ||
          (line.includes("Wrote") && line.includes("0x00010000"))
        ) {
          setUploadProgress(95);
        } else if (line.includes("Hash of data verified")) {
          setUploadStage("verifying");
          setUploadProgress(96);
        } else if (line.includes("Leaving")) {
          setUploadStage("verifying");
          setUploadProgress(97);
        } else if (line.includes("Hard resetting via RTS pin")) {
          setUploadStage("completed"); // Tentative stage
          setUploadProgress(98);
        } else if (
          line.includes("=========================") &&
          line.includes("[SUCCESS]") &&
          line.includes("Took")
        ) {
          // Specific success line for an environment, e.g.:
          // stdout: ========================= [SUCCESS] Took 24.22 seconds =========================
          setUploadStage("completed");
          setUploadProgress(100);
        } else if (
          line.includes("=========================") &&
          line.includes("[FAILED]") &&
          line.includes("Took")
        ) {
          // Specific failure line for an environment, e.g.:
          // stderr: ========================= [FAILED] Took 10.97 seconds =========================
          setUploadStage("error");
          // Let the main catch block in handleFlashFirmware determine overall status and message.
          // Progress will likely stop updating here or be overridden by handleFlashFirmware.
        } else if (
          line.includes("====================") &&
          (line.includes("failed") || line.includes("succeeded")) &&
          line.includes("in")
        ) {
          // Overall summary line from pio, e.g.:
          // stderr: ==================== 1 failed, 1 succeeded in 00:00:35.190 ====================
          // This can provide context if the main process didn't terminate early.
          if (line.includes("failed")) {
            // If a failure is reported in the summary, ensure stage reflects error,
            // unless a specific environment success already set it to completed and main process will resolve successfully.
            if (uploadStage !== "completed") {
              // Avoid overriding a deliberate early success completion
              setUploadStage("error");
            }
          } else if (uploadStage !== "error" && uploadStage !== "completed") {
            // Don't override specific error or early success
            // Only if no specific env error/success was caught and we see overall success.
            setUploadStage("completed");
            setUploadProgress(100);
          }
        }
      }
    });
  };

  const handleFlashFirmware = async () => {
    if (!selectedPort) {
      setMessage("Please select a serial port");
      setStatus("error");
      return;
    }

    // Reset state
    setStatus("loading");
    setMessage("Preparing to upload firmware...");
    setUploadStage("preparing");
    setUploadProgress(0);
    setUploadLog([]);

    try {
      // @ts-ignore - Global electron object
      await window.electron.flashFirmware(selectedPort);
      setStatus("success");
      setMessage("Firmware uploaded successfully! Starting IP detection...");
      setUploadStage("completed");
      setUploadProgress(100);

      // Start the IP finder after successful firmware upload and show feedback
      setStatus("detecting");
      try {
        // @ts-ignore - Global electron object
        const ipResult = await window.electron.startIpFinderAndWait(10000);
        if (ipResult.success && ipResult.ipDetected) {
          setMessage("ESP32 IP address detected successfully! Redirecting...");
        } else {
          setMessage("IP detection completed. " + (ipResult.message || ""));
        }
      } catch (ipError) {
        console.error("Error during IP detection:", ipError);
        setMessage("Error detecting IP address. Redirecting anyway...");
      }

      router.push("/connection");
    } catch (error) {
      console.error("Firmware upload failed:", error);

      // Handle specific errors with more helpful messages
      if (
        error.error &&
        (error.error.includes("spawn pio ENOENT") ||
          error.error.includes("Cannot find") ||
          error.error.includes("not found"))
      ) {
        setMessage(
          "PlatformIO (pio) command not found. Please make sure PlatformIO is installed and in your PATH. " +
            "Run 'pip install platformio' to install it."
        );
      } else {
        setMessage(
          error.error ||
            "Failed to upload firmware. Please make sure no other processes are using the serial port and try again."
        );
      }

      setStatus("error");
      setUploadStage("error");
    }
  };

  // Get stage display information
  const getStageInfo = () => {
    switch (uploadStage) {
      case "preparing":
        return {
          icon: <Loader2 className="animate-spin" />,
          text: "Preparing firmware...",
        };
      case "connecting":
        return {
          icon: <Loader2 className="animate-spin" />,
          text: "Connecting to ESP32...",
        };
      case "erasing":
        return {
          icon: <Loader2 className="animate-spin" />,
          text: "Erasing flash memory...",
        };
      case "uploading":
        return {
          icon: <Upload className="animate-pulse" />,
          text: "Uploading firmware...",
        };
      case "verifying":
        return {
          icon: <Loader2 className="animate-spin" />,
          text: "Verifying upload...",
        };
      case "completed":
        return {
          icon: <CheckCircle className="text-green-500" />,
          text: "Upload complete!",
        };
      case "error":
        return {
          icon: <AlertCircle className="text-red-500" />,
          text: "Upload failed",
        };
      default:
        return {
          icon: <Loader2 className="animate-spin" />,
          text: "Processing...",
        };
    }
  };

  // Get content based on current status
  const getStatusContent = () => {
    if (status === "loading") {
      return (
        <div className="space-y-6 pt-2">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 flex items-center justify-center">
              {stageInfo.icon}
            </div>
            <span className="font-medium text-lg">{stageInfo.text}</span>
          </div>

          <Progress value={uploadProgress} className="h-1" />

          {/* Stage Indicators */}
          <div className="flex justify-between pt-2 px-1">
            <div
              className={`flex flex-col items-center transition-colors duration-300 ${
                ["preparing", "connecting"].includes(uploadStage)
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full mb-1.5 transition-colors duration-300 ${
                  ["preparing", "connecting"].includes(uploadStage)
                    ? "bg-blue-600 dark:bg-blue-400"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              ></div>
              <span className="text-[10px] uppercase tracking-wider font-medium">
                Connect
              </span>
            </div>

            <div
              className={`flex flex-col items-center transition-colors duration-300 ${
                uploadStage === "erasing"
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full mb-1.5 transition-colors duration-300 ${
                  uploadStage === "erasing"
                    ? "bg-blue-600 dark:bg-blue-400"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              ></div>
              <span className="text-[10px] uppercase tracking-wider font-medium">
                Erase
              </span>
            </div>

            <div
              className={`flex flex-col items-center transition-colors duration-300 ${
                uploadStage === "uploading"
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full mb-1.5 transition-colors duration-300 ${
                  uploadStage === "uploading"
                    ? "bg-blue-600 dark:bg-blue-400"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              ></div>
              <span className="text-[10px] uppercase tracking-wider font-medium">
                Upload
              </span>
            </div>

            <div
              className={`flex flex-col items-center transition-colors duration-300 ${
                ["verifying", "completed"].includes(uploadStage)
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full mb-1.5 transition-colors duration-300 ${
                  ["verifying", "completed"].includes(uploadStage)
                    ? "bg-blue-600 dark:bg-blue-400"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              ></div>
              <span className="text-[10px] uppercase tracking-wider font-medium">
                Verify
              </span>
            </div>
          </div>

          {uploadLog.length > 0 && (
            <div className="bg-gray-50/50 dark:bg-gray-800/50 text-xs py-2 px-3 rounded-md text-gray-600 dark:text-gray-300 backdrop-blur-sm">
              {uploadLog[0]}
            </div>
          )}
        </div>
      );
    } else if (status === "detecting") {
      return (
        <div className="space-y-6 pt-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50/50 dark:bg-blue-900/20 mb-4 backdrop-blur-sm">
              <Wifi className="h-8 w-8 text-blue-500 dark:text-blue-400 animate-pulse" />
            </div>
            <h3 className="text-lg font-medium mb-1">Detecting IP Address</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              The ESP32 is connecting to your WiFi network
            </p>
          </div>

          <Progress value={60} className="h-1" />

          <div className="bg-gray-50/50 dark:bg-gray-800/50 text-sm py-3 px-4 rounded-md text-center backdrop-blur-sm">
            {message}
          </div>
        </div>
      );
    } else if (status === "error") {
      return (
        <div className="mt-4 py-3 px-4 rounded-md bg-red-50/50 dark:bg-red-900/20 text-red-800 dark:text-red-300 backdrop-blur-sm flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          <span>{message}</span>
        </div>
      );
    } else if (status === "success") {
      return (
        <div className="mt-4 py-3 px-4 rounded-md bg-green-50/50 dark:bg-green-900/20 text-green-800 dark:text-green-300 backdrop-blur-sm flex items-start">
          <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          <span>{message}</span>
        </div>
      );
    }

    return null;
  };

  const stageInfo = getStageInfo();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 p-6">
      <div className="w-full max-w-md backdrop-blur-md bg-white/70 dark:bg-gray-900/70 rounded-2xl shadow-xl p-8 border border-white/20 dark:border-gray-800/30">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            ESP32 Firmware Setup
          </h1>
          {status === "idle" && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Upload the latest firmware to your ESP32 board or skip if already
              configured.
            </p>
          )}
        </div>

        <div className="space-y-6">
          {serialPorts.length > 0 && status === "idle" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Device
              </label>
              <Select
                value={selectedPort}
                onValueChange={setSelectedPort}
                disabled={status !== "idle"}
              >
                <SelectTrigger className="h-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-200/50 dark:border-gray-700/50 rounded-lg">
                  <SelectValue placeholder="Select a port" />
                </SelectTrigger>
                <SelectContent>
                  {serialPorts.map((port) => (
                    <SelectItem key={port.path} value={port.path}>
                      {port.path}{" "}
                      {port.manufacturer ? `(${port.manufacturer})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : status === "idle" ? (
            <div className="py-4 px-5 bg-amber-50/50 dark:bg-amber-900/20 rounded-lg text-amber-800 dark:text-amber-300 text-sm backdrop-blur-sm">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
                <span>
                  No serial ports detected. Please connect your ESP32 and
                  refresh.
                </span>
              </div>
            </div>
          ) : null}

          {getStatusContent()}

          <div className="flex justify-between pt-4">
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={status === "loading" || status === "detecting"}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-lg"
            >
              Skip Setup
            </Button>
            <Button
              onClick={handleFlashFirmware}
              disabled={
                status === "loading" ||
                status === "detecting" ||
                serialPorts.length === 0
              }
              className="bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 rounded-lg shadow-md hover:shadow-lg transition-all"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : status === "detecting" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Detecting...
                </>
              ) : (
                <>
                  Upload Firmware
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
