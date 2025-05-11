"use client";

import { useRouter } from "next/router";
import { useState, useEffect, useCallback } from "react";
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
import { X } from "lucide-react";
import { motion } from "framer-motion";
import useWSStore from "@/lib/stores/wsStore"; // Import the store

export default function ConnectionPage() {
  const router = useRouter();

  // Get state and actions from WSStore
  const connectionStatus = useWSStore((state) => state.connectionStatus);
  const lastIpOctetFromStore = useWSStore((state) => state.lastIpOctet);
  const errorMessage = useWSStore((state) => state.errorMessage);
  const infoMessage = useWSStore((state) => state.infoMessage);
  const {
    connectToDevice,
    setErrorMessage: setWSErrorMessage,
    setInfoMessage: setWSInfoMessage,
  } = useWSStore.getState();

  // Local state for the dialog input and visibility
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [dialogInputOctet, setDialogInputOctet] = useState(""); // For the IP input field in the dialog

  // Local state for the IP auto-detection flow, distinct from WebSocket connection status
  type IpFetchingStatus = "idle" | "fetching" | "error" | "success";
  const [ipFetchingStatus, setIpFetchingStatus] =
    useState<IpFetchingStatus>("idle");

  // Effect for clearing messages from the wsStore after a timeout
  useEffect(() => {
    let errorTimer: NodeJS.Timeout | null = null;
    let infoTimer: NodeJS.Timeout | null = null;

    if (errorMessage) {
      errorTimer = setTimeout(() => setWSErrorMessage(null), 5000);
    }
    if (infoMessage) {
      // Info messages related to connection process might be better managed by the process itself
      // For now, clear them after a slightly shorter duration if they are not errors.
      infoTimer = setTimeout(() => setWSInfoMessage(null), 4000);
    }

    return () => {
      if (errorTimer) clearTimeout(errorTimer);
      if (infoTimer) clearTimeout(infoTimer);
    };
  }, [errorMessage, infoMessage, setWSErrorMessage, setWSInfoMessage]);

  // Handles the connection attempt when the user submits the IP from the dialog
  const handleDialogConnect = useCallback(async () => {
    if (connectionStatus === "connecting") {
      console.log(
        "[ConnectionPage] Already attempting to connect. Ignoring request."
      );
      return;
    }

    const octetNum = parseInt(dialogInputOctet, 10);
    if (isNaN(octetNum) || octetNum < 0 || octetNum > 255) {
      setWSErrorMessage("Invalid IP address ending (must be 0-255)");
      return;
    }

    setIsConnectionDialogOpen(false); // Close dialog before attempting connection
    await connectToDevice(dialogInputOctet); // connectToDevice in wsStore handles setting messages
    // Navigation and further UI updates will be driven by wsStore state changes
  }, [connectToDevice, dialogInputOctet, setWSErrorMessage, connectionStatus]);

  // Effect for automatic IP detection logic
  useEffect(() => {
    let cleanupIpListener: (() => void) | null = null;
    let ipDetectionTimeoutId: NodeJS.Timeout | null = null;

    if (ipFetchingStatus === "fetching") {
      console.log("[ConnectionPage] Starting IP detection...");
      setWSInfoMessage("Attempting automatic IP detection...");

      ipDetectionTimeoutId = setTimeout(() => {
        if (ipFetchingStatus === "fetching") {
          console.log(
            "[ConnectionPage] IP detection timed out. Opening manual input dialog."
          );
          setWSErrorMessage(
            "IP detection timed out. Please enter IP manually."
          );
          setIpFetchingStatus("error"); // Update local IP fetching status
          setIsConnectionDialogOpen(true);
          setWSInfoMessage(null); // Clear the "Attempting..." message
        }
      }, 5000); // Increased timeout for IP detection

      const handleIpUpdate = async (data: { ip?: string; error?: string }) => {
        console.log("[ConnectionPage] IPC 'ip-update' received:", data);

        if (ipFetchingStatus !== "fetching") {
          console.log(
            "[ConnectionPage] Ignoring IP update, no longer in fetchingIp state."
          );
          return;
        }

        if (ipDetectionTimeoutId) {
          clearTimeout(ipDetectionTimeoutId);
          ipDetectionTimeoutId = null;
        }

        if (data.ip) {
          const prefix = "192.168.1.";
          if (data.ip.startsWith(prefix)) {
            const octet = data.ip.substring(prefix.length);
            const octetNum = parseInt(octet, 10);
            if (!isNaN(octetNum) && octetNum >= 0 && octetNum <= 255) {
              console.log(
                `[ConnectionPage] Extracted last octet: ${octet}. Attempting WS connection.`
              );
              setIpFetchingStatus("success"); // IP found successfully
              setDialogInputOctet(octet); // Pre-fill for dialog or if needed elsewhere
              await connectToDevice(octet); // This will update wsStore's connectionStatus
            } else {
              console.error(
                "[ConnectionPage] Invalid IP format received:",
                data.ip
              );
              setWSErrorMessage("Received invalid IP format from device.");
              setIpFetchingStatus("error");
            }
          } else {
            console.error(
              "[ConnectionPage] IP received doesn't start with 192.168.1.:",
              data.ip
            );
            setWSErrorMessage("Received unexpected IP format from device.");
            setIpFetchingStatus("error");
          }
        } else if (data.error) {
          console.error(
            "[ConnectionPage] IP detection error from main process:",
            data.error
          );
          setWSErrorMessage(
            `IP detection failed: ${data.error}. Try manual connection.`
          );
          setIpFetchingStatus("error");
        }

        // If IP detection ultimately failed, ensure dialog is open
        if (ipFetchingStatus === "error" && !isConnectionDialogOpen) {
          setIsConnectionDialogOpen(true);
        }
      };

      cleanupIpListener = window.ipc.on("ip-update", handleIpUpdate);
      window.ipc.send("start-ip-watch", {});
    }

    return () => {
      if (cleanupIpListener) {
        console.log("[ConnectionPage] Cleaning up IPC IP detection listener.");
        cleanupIpListener();
      }
      if (ipDetectionTimeoutId) {
        clearTimeout(ipDetectionTimeoutId);
      }
      // Stop IP watch if it was active and component is unmounting or IP fetching stops
      if (ipFetchingStatus === "fetching" || cleanupIpListener) {
        console.log(
          "[ConnectionPage] Stopping IP watch in main process (cleanup)."
        );
        window.ipc.send("stop-ip-watch", {});
      }
    };
  }, [
    ipFetchingStatus,
    connectToDevice,
    setWSErrorMessage,
    setWSInfoMessage,
    isConnectionDialogOpen,
  ]);

  // Effect to handle navigation once wsStore indicates a successful connection
  useEffect(() => {
    if (connectionStatus === "connected") {
      // setWSInfoMessage("Connected! Redirecting to configurations..."); // wsStore.connectToDevice sets this
      const timer = setTimeout(() => {
        router.push("/configurations");
      }, 1500); // Delay for user to see the success message from wsStore
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, router, setWSInfoMessage]);

  // Effect to initialize IP fetching if not already connected or attempting to connect
  useEffect(() => {
    if (connectionStatus === "idle" && ipFetchingStatus === "idle") {
      setIpFetchingStatus("fetching");
    } else if (connectionStatus === "connected") {
      // If already connected (e.g. due to persisted session via wsStore init), redirect.
      router.push("/configurations");
    }
  }, [connectionStatus, ipFetchingStatus, router]);

  // UI Action: Open the manual connection dialog
  const openManualConnectDialog = () => {
    if (ipFetchingStatus === "fetching") {
      window.ipc.send("stop-ip-watch", {}); // Stop auto-detection if running
    }
    setIpFetchingStatus("idle");
    setWSErrorMessage(null); // Clear previous errors before opening dialog
    setIsConnectionDialogOpen(true);
  };

  // UI Action: Retry auto-detection from the dialog
  const tryAutoDetectAgain = () => {
    setWSErrorMessage(null);
    setWSInfoMessage(null);
    setIsConnectionDialogOpen(false);
    setIpFetchingStatus("fetching"); // Re-trigger IP auto-detection
  };

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
          onClick={() =>
            router.push(
              connectionStatus === "connected" ? "/configurations" : "/home"
            )
          }
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-2">
          Connect to Board
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-8">
          {connectionStatus === "connected"
            ? "Successfully connected!"
            : "Connect to your Everwood CNC hardware"}
        </p>

        {/* Display for IP Fetching State (local to this page) */}
        {ipFetchingStatus === "fetching" &&
          connectionStatus !== "connecting" &&
          connectionStatus !== "connected" && (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-6"></div>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {infoMessage || "Attempting automatic IP detection..."}{" "}
                {/* Show store's info message */}
              </p>
              <Button variant="outline" onClick={openManualConnectDialog}>
                Enter IP Manually
              </Button>
            </div>
          )}

        {/* Display for WebSocket Connection Status (from wsStore) */}
        {connectionStatus === "connecting" && (
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-6"></div>
            <p className="text-gray-600 dark:text-gray-300">
              {infoMessage ||
                `Connecting to 192.168.1.${
                  lastIpOctetFromStore || dialogInputOctet
                }...`}
            </p>
          </div>
        )}

        {connectionStatus === "connected" && (
          <div className="text-center py-6">
            <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 p-4 rounded-lg mb-6">
              <p className="font-medium">
                Connected to board at 192.168.1.{lastIpOctetFromStore}
              </p>
              <p className="text-sm mt-1">
                {infoMessage || "Redirecting to configurations..."}
              </p>
            </div>
          </div>
        )}

        {/* Display for Error Status (from wsStore) or Idle (post-IP fetch attempt) prompting action */}
        {(connectionStatus === "error" ||
          (connectionStatus === "idle" && ipFetchingStatus !== "fetching")) && (
          <div className="text-center py-4">
            {errorMessage && (
              <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 rounded-lg mb-4">
                <p className="font-medium">{errorMessage}</p>
              </div>
            )}
            <Button onClick={openManualConnectDialog} className="mt-4">
              {connectionStatus === "error"
                ? "Try Manual Connection"
                : "Connect to Board"}
            </Button>
          </div>
        )}

        {/* Fallback for general info/error messages from store if not covered by specific status blocks */}
        {/* These are primarily for the timeout effect to clear them from the store */}
        {/* errorMessage from store is already shown in the 'error' block above */}
        {/* infoMessage from store is shown in various status blocks */}
      </motion.div>

      <Dialog
        open={isConnectionDialogOpen}
        onOpenChange={setIsConnectionDialogOpen}
      >
        <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Manual Connection
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Board IP Address (Last Octet)
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
                value={dialogInputOctet} // Uses local state for dialog input
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty, or numbers from 0 up to 3 digits
                  if (/^\d{0,3}$/.test(value)) {
                    if (value === "") {
                      setDialogInputOctet(value);
                    } else {
                      const num = parseInt(value, 10);
                      if (num >= 0 && num <= 255) {
                        setDialogInputOctet(value);
                      } else if (num > 255) {
                        // If user types something > 255, cap it or show error immediately
                        // For now, just don't update if > 255 and not 3 digits yet
                        // or set to 255 if they typed e.g. 300
                        setDialogInputOctet("255"); // Cap at 255
                      }
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dialogInputOctet) {
                    const octetNum = parseInt(dialogInputOctet, 10);
                    if (!isNaN(octetNum) && octetNum >= 0 && octetNum <= 255) {
                      handleDialogConnect();
                    } else {
                      setWSErrorMessage("Enter a valid IP octet (0-255).");
                    }
                  }
                }}
                className="flex-1 w-20 text-center font-mono"
                placeholder="XXX"
              />
            </div>
            {/* Inline validation for dialog input octet */}
            {dialogInputOctet &&
              (parseInt(dialogInputOctet, 10) > 255 ||
                parseInt(dialogInputOctet, 10) < 0 ||
                (isNaN(parseInt(dialogInputOctet, 10)) &&
                  dialogInputOctet !== "")) && (
                <p className="text-red-500 text-xs mt-1">
                  Must be a number between 0-255.
                </p>
              )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={tryAutoDetectAgain}>
              Try Auto-Detect
            </Button>
            <Button
              onClick={handleDialogConnect}
              disabled={
                !dialogInputOctet ||
                parseInt(dialogInputOctet, 10) > 255 ||
                parseInt(dialogInputOctet, 10) < 0 ||
                isNaN(parseInt(dialogInputOctet, 10)) ||
                connectionStatus === "connecting"
              }
            >
              {connectionStatus === "connecting" ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
