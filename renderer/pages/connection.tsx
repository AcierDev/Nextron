"use client";

import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";
import { motion } from "framer-motion";

// Define connection status type
type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "fetchingIp";

export default function ConnectionPage() {
  const router = useRouter();

  // Connection state
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("fetchingIp");
  const [lastIpOctet, setLastIpOctet] = useState("");
  const [isFetchingIp, setIsFetchingIp] = useState(true);
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Effect for message timeouts
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

  // Handle connecting to the ESP32 device
  const handleConnect = useCallback(
    async (lastOctet: string) => {
      // Prevent starting a new connection if already connecting
      if (connectionStatus === "connecting") {
        console.log("Already connecting to a device. Ignoring request.");
        return;
      }

      const octetNum = parseInt(lastOctet, 10);
      if (isNaN(octetNum) || octetNum < 0 || octetNum > 255) {
        setConnectionStatus("error");
        setErrorMessage("Invalid IP address ending (must be 0-255)");
        setInfoMessage(null);
        setIsFetchingIp(false);
        return;
      }

      setConnectionStatus("connecting");
      setErrorMessage(null);
      setInfoMessage(`Connecting to 192.168.1.${lastOctet}...`);

      try {
        // Use the main process to establish the WebSocket connection
        const result = await window.ipc.invoke("connect-websocket", lastOctet);

        if (result.success) {
          console.log("Connection successful:", result);
          setConnectionStatus("connected");
          setErrorMessage(null);
          setInfoMessage(
            "Connected to board! Redirecting to configurations..."
          );
          setIsFetchingIp(false);

          // No need to store connection status separately as it's managed by the main process

          // Set up event listener for WebSocket status changes
          const wsStatusListener = window.ipc.on("ws-status", (data: any) => {
            console.log("WebSocket status update:", data);

            if (data.status === "disconnected" || data.status === "error") {
              setConnectionStatus("error");
              setErrorMessage(
                data.status === "error"
                  ? `Connection error: ${data.error || "Unknown error"}`
                  : "Connection closed. Device may have disconnected."
              );
            }
          });

          // Navigate to configurations page
          router.push("/configurations");

          // Return function to clean up event listener
          return () => {
            if (wsStatusListener) {
              wsStatusListener();
            }
          };
        } else {
          console.error("Failed to connect:", result.error);
          setConnectionStatus("error");
          setErrorMessage(`Connection failed: ${result.error}`);
          setInfoMessage(null);
        }
      } catch (error) {
        console.error("Error during connection:", error);
        setConnectionStatus("error");
        setErrorMessage(`Connection error: ${(error as Error).message}`);
        setInfoMessage(null);
      }
    },
    [connectionStatus, router]
  );

  // Add IP detection effect
  useEffect(() => {
    let cleanupListener: (() => void) | null = null;
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
      }, 3000);

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
  }, [connectionStatus, handleConnect]);

  // Check if we're already connected when the page loads
  useEffect(() => {
    const checkExistingConnection = async () => {
      try {
        const connectionData = await window.ipc.invoke("get-connection-status");

        if (connectionData && connectionData.connected) {
          console.log("Already connected:", connectionData);
          setConnectionStatus("connected");
          setLastIpOctet(connectionData.ipOctet || "");
          setInfoMessage("Already connected to board. Redirecting...");

          // Redirect to configurations page after a short delay
          setTimeout(() => {
            router.push("/configurations");
          }, 1500);
        }
      } catch (err) {
        console.error("Error checking connection status:", err);
      }
    };

    checkExistingConnection();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="backdrop-blur-md bg-white/70 dark:bg-gray-800/50 rounded-xl border border-white/20 dark:border-gray-700/30 shadow-lg p-8 max-w-md w-full relative"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/configurations")}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-2">
          Connect to Board
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-8">
          Connect to your Everwood CNC hardware first
        </p>

        {connectionStatus === "fetchingIp" && (
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-6"></div>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Attempting automatic IP detection...
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setIsFetchingIp(false);
                setErrorMessage(null);
                setConnectionStatus("idle");
                setIsConnectionDialogOpen(true);
              }}
            >
              Enter IP Manually
            </Button>
          </div>
        )}

        {connectionStatus === "connecting" && (
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-6"></div>
            <p className="text-gray-600 dark:text-gray-300">
              Connecting to 192.168.1.{lastIpOctet}...
            </p>
          </div>
        )}

        {connectionStatus === "connected" && (
          <div className="text-center py-6">
            <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 p-4 rounded-lg mb-6">
              <p className="font-medium">
                Connected to board at 192.168.1.{lastIpOctet}
              </p>
              <p className="text-sm mt-1">Redirecting to configurations...</p>
            </div>
          </div>
        )}

        {connectionStatus === "error" && (
          <div className="text-center py-4">
            <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 rounded-lg mb-4">
              <p className="font-medium">
                {errorMessage || "Connection error"}
              </p>
            </div>
            <Button
              onClick={() => setIsConnectionDialogOpen(true)}
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        )}

        {connectionStatus === "idle" && (
          <Button
            onClick={() => setIsConnectionDialogOpen(true)}
            className="w-full"
          >
            Connect to Board
          </Button>
        )}

        {errorMessage && connectionStatus !== "error" && (
          <p className="text-red-500 dark:text-red-400 text-sm mt-4 text-center">
            {errorMessage}
          </p>
        )}

        {infoMessage && (
          <p className="text-blue-500 dark:text-blue-400 text-sm mt-4 text-center">
            {infoMessage}
          </p>
        )}
      </motion.div>

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
    </div>
  );
}
