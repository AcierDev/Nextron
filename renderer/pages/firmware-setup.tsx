"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronRight,
  Upload,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

export default function FirmwareSetupPage() {
  const router = useRouter();
  const [serialPorts, setSerialPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [status, setStatus] = useState("idle"); // idle, loading, success, error
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
        setSerialPorts(ports);
        if (ports.length > 0) {
          setSelectedPort(ports[0].path);
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
    // Start the IP finder when the user skips firmware upload
    try {
      // @ts-ignore - Global electron object
      window.electron.startIpFinder();
      console.log("Started IP finder after skipping firmware upload");
    } catch (error) {
      console.error("Failed to start IP finder:", error);
    }

    // Navigate to configurations page
    router.push("/configurations");
  };

  // Parse PlatformIO output to update UI accordingly
  const parseOutput = (output) => {
    // Split output by lines and process each line
    const lines = output.split(/\r?\n/).filter((line) => line.trim());

    lines.forEach((line) => {
      if (line.trim()) {
        // Only store the most recent line for display
        setUploadLog([line]);

        // Update the upload stage based on the line
        if (line.includes("Connecting") || line.includes("Chip is")) {
          setUploadStage("connecting");
          setUploadProgress(10);
        } else if (line.includes("Flash will be erased")) {
          setUploadStage("erasing");
          setUploadProgress(20);
        } else if (line.includes("Writing at 0x")) {
          setUploadStage("uploading");

          // Try to extract percentage information
          const percentMatch = line.match(/\((\d+) %\)/);
          if (percentMatch && percentMatch[1]) {
            const percent = parseInt(percentMatch[1]);
            // Scale from 0-100 to 30-90 range to show progress
            const scaledPercent = 30 + percent * 0.6;
            setUploadProgress(scaledPercent);
          }
        } else if (line.includes("Hash of data verified")) {
          setUploadStage("verifying");
          setUploadProgress(90);
        } else if (line.includes("[SUCCESS]")) {
          setUploadStage("completed");
          setUploadProgress(100);
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
      const result = await window.electron.flashFirmware(selectedPort);
      setStatus("success");
      setMessage("Firmware uploaded successfully! Starting IP detection...");
      setUploadStage("completed");
      setUploadProgress(100);

      // Start the IP finder after successful firmware upload
      try {
        // @ts-ignore - Global electron object
        await window.electron.startIpFinder();
        console.log("Started IP finder after firmware upload");
      } catch (ipError) {
        console.error("Failed to start IP finder:", ipError);
      }

      // Redirect after a short delay so user can see success message
      setTimeout(() => {
        router.push("/configurations");
      }, 2000);
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
          error.error || "Failed to upload firmware. Please try again."
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

  const stageInfo = getStageInfo();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Firmware Setup</CardTitle>
          <CardDescription>
            Upload firmware to your ESP32 board or skip if already done
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {serialPorts.length > 0 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Port</label>
              <Select
                value={selectedPort}
                onValueChange={setSelectedPort}
                disabled={status === "loading"}
              >
                <SelectTrigger>
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
          ) : (
            <div className="text-amber-600 dark:text-amber-400 text-sm">
              No serial ports detected. Make sure your ESP32 is connected.
            </div>
          )}

          {status === "loading" && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center space-x-3">
                {stageInfo.icon}
                <span className="font-medium">{stageInfo.text}</span>
              </div>

              <Progress value={uploadProgress} className="h-2" />

              <div className="relative mt-6">
                <div className="absolute left-0 -top-3 w-full border-t border-gray-200 dark:border-gray-700"></div>
                <div className="relative flex justify-between">
                  <div
                    className={`flex flex-col items-center ${
                      uploadStage === "preparing" ||
                      uploadStage === "connecting"
                        ? "text-blue-500"
                        : "text-gray-500"
                    }`}
                  >
                    <div
                      className={`rounded-full w-6 h-6 flex items-center justify-center ${
                        uploadStage === "preparing" ||
                        uploadStage === "connecting"
                          ? "bg-blue-100 dark:bg-blue-900"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      <span className="text-xs">1</span>
                    </div>
                    <span className="text-xs mt-1">Connect</span>
                  </div>
                  <div
                    className={`flex flex-col items-center ${
                      uploadStage === "erasing"
                        ? "text-blue-500"
                        : "text-gray-500"
                    }`}
                  >
                    <div
                      className={`rounded-full w-6 h-6 flex items-center justify-center ${
                        uploadStage === "erasing"
                          ? "bg-blue-100 dark:bg-blue-900"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      <span className="text-xs">2</span>
                    </div>
                    <span className="text-xs mt-1">Erase</span>
                  </div>
                  <div
                    className={`flex flex-col items-center ${
                      uploadStage === "uploading"
                        ? "text-blue-500"
                        : "text-gray-500"
                    }`}
                  >
                    <div
                      className={`rounded-full w-6 h-6 flex items-center justify-center ${
                        uploadStage === "uploading"
                          ? "bg-blue-100 dark:bg-blue-900"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      <span className="text-xs">3</span>
                    </div>
                    <span className="text-xs mt-1">Upload</span>
                  </div>
                  <div
                    className={`flex flex-col items-center ${
                      uploadStage === "verifying" || uploadStage === "completed"
                        ? "text-blue-500"
                        : "text-gray-500"
                    }`}
                  >
                    <div
                      className={`rounded-full w-6 h-6 flex items-center justify-center ${
                        uploadStage === "verifying" ||
                        uploadStage === "completed"
                          ? "bg-blue-100 dark:bg-blue-900"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      <span className="text-xs">4</span>
                    </div>
                    <span className="text-xs mt-1">Verify</span>
                  </div>
                </div>
              </div>

              {uploadLog.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 text-xs p-3 rounded border border-gray-200 dark:border-gray-700 font-mono mt-4 min-h-[40px] flex items-center">
                  {uploadLog[0]}
                </div>
              )}
            </div>
          )}

          {status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {status === "success" && (
            <Alert>
              <AlertDescription className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2" />
                {message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            onClick={handleFlashFirmware}
            disabled={status === "loading" || serialPorts.length === 0}
          >
            {status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                Upload Firmware
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
