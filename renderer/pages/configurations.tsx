"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PlusCircle,
  Trash2,
  MoreVertical,
  ChevronRight,
  Loader2,
  Pencil,
  Settings,
  CalendarClock,
  RotateCw,
  Info,
} from "lucide-react";
import { Label } from "@/components/ui/label";

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

// Updated Configuration type to match enhanced 'get-configs' response
type ConfigListItem = {
  _id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  hardware?: {
    servos?: any[];
    steppers?: any[];
    pins?: any[];
  };
};

export default function ConfigurationsPage() {
  const router = useRouter();
  const [configurations, setConfigurations] = useState<ConfigListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // New Config Dialog
  const [isNewConfigOpen, setIsNewConfigOpen] = useState(false);
  const [newConfigName, setNewConfigName] = useState("");
  const [newConfigDescription, setNewConfigDescription] = useState("");
  // Rename Dialog
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renamingConfigId, setRenamingConfigId] = useState<string | null>(null);
  const [renamingConfigCurrentName, setRenamingConfigCurrentName] =
    useState("");
  const [configNewName, setConfigNewName] = useState("");
  // Delete Dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [deletingConfigName, setDeletingConfigName] = useState("");
  // Generic processing state
  const [isProcessing, setIsProcessing] = useState(false);
  // New state for description dialog
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editingConfigName, setEditingConfigName] = useState("");
  const [configDescription, setConfigDescription] = useState("");

  useEffect(() => {
    const fetchConfigs = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        console.log("[ConfigPage] Fetching configurations via IPC...");
        const data = await window.ipc.invoke("get-configs");
        if (Array.isArray(data)) {
          setConfigurations(data);
          console.log("[ConfigPage] Fetched configurations:", data.length);
        } else {
          throw new Error("Invalid data received from backend");
        }
      } catch (error) {
        console.error("[ConfigPage] Failed to fetch configurations:", error);
        setErrorMessage(
          `Failed to load configurations: ${(error as Error).message}`
        );
        setConfigurations([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfigs();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (infoMessage) {
      timer = setTimeout(() => setInfoMessage(null), 3000);
    }
    if (isProcessing && errorMessage) {
      setErrorMessage(null);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [infoMessage, isProcessing, errorMessage]);

  const handleCreateConfig = async () => {
    const trimmedName = newConfigName.trim();
    if (!trimmedName) {
      setErrorMessage("Configuration name cannot be empty.");
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      console.log(`[ConfigPage] Creating config: ${trimmedName}`);
      const newConfig = await window.ipc.invoke(
        "create-config",
        trimmedName,
        newConfigDescription
      );
      if (!newConfig || !newConfig._id) {
        throw new Error("Backend did not return a valid new configuration.");
      }
      setConfigurations((prev) =>
        [
          ...prev,
          {
            _id: newConfig._id,
            name: newConfig.name,
            description: newConfig.description,
            updatedAt: newConfig.updatedAt,
          },
        ].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewConfigName("");
      setNewConfigDescription("");
      setIsNewConfigOpen(false);
      setInfoMessage(`Configuration '${newConfig.name}' created.`);
      router.push(`/dashboard?config=${newConfig._id}`);
    } catch (error) {
      console.error("[ConfigPage] Failed to create configuration:", error);
      setErrorMessage(`Create failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRenameConfig = async () => {
    const trimmedNewName = configNewName.trim();
    if (
      !renamingConfigId ||
      !trimmedNewName ||
      trimmedNewName === renamingConfigCurrentName
    ) {
      setErrorMessage(
        !renamingConfigId
          ? "Error: No config ID for rename."
          : !trimmedNewName
          ? "Please enter a valid new name."
          : "New name is the same as the current name."
      );
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      console.log(
        `[ConfigPage] Renaming config ${renamingConfigId} to ${trimmedNewName}`
      );
      await window.ipc.invoke(
        "rename-config",
        renamingConfigId,
        trimmedNewName
      );
      setConfigurations((prev) =>
        prev
          .map((config) =>
            config._id === renamingConfigId
              ? { ...config, name: trimmedNewName }
              : config
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setInfoMessage(`Configuration renamed to '${trimmedNewName}'.`);
      setIsRenameDialogOpen(false);
      setRenamingConfigId(null);
      setRenamingConfigCurrentName("");
      setConfigNewName("");
    } catch (error) {
      console.error("[ConfigPage] Failed to rename configuration:", error);
      setErrorMessage(`Rename failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!deletingConfigId || !deletingConfigName) {
      setErrorMessage("Error: Config ID or name missing for deletion.");
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      console.log(`[ConfigPage] Deleting config: ${deletingConfigId}`);
      await window.ipc.invoke("delete-config", deletingConfigId);
      setConfigurations((prev) =>
        prev.filter((config) => config._id !== deletingConfigId)
      );
      setInfoMessage(`Configuration '${deletingConfigName}' deleted.`);
      setDeletingConfigId(null);
      setDeletingConfigName("");
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error("[ConfigPage] Failed to delete configuration:", error);
      setErrorMessage(`Delete failed: ${(error as Error).message}`);
      setIsDeleteDialogOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadConfig = (id: string) => {
    if (isProcessing) return;
    console.log(`[ConfigPage] Loading config: ${id}`);
    router.push(`/dashboard?config=${id}`);
  };

  const handleUpdateDescription = async () => {
    if (!editingConfigId) {
      setErrorMessage("Error: No config ID for description update.");
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      console.log(
        `[ConfigPage] Updating description for config ${editingConfigId}`
      );
      await window.ipc.invoke(
        "update-description",
        editingConfigId,
        configDescription
      );
      setConfigurations((prev) =>
        prev.map((config) =>
          config._id === editingConfigId
            ? { ...config, description: configDescription }
            : config
        )
      );
      setInfoMessage("Configuration description updated.");
      setIsDescriptionDialogOpen(false);
      setEditingConfigId(null);
      setEditingConfigName("");
      setConfigDescription("");
    } catch (error) {
      console.error("[ConfigPage] Failed to update description:", error);
      setErrorMessage(`Update failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown date";
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Helper function to count the motors and IO
  const getHardwareSummary = (config: ConfigListItem) => {
    if (!config.hardware) return null;

    const servosCount = config.hardware.servos?.length || 0;
    const steppersCount = config.hardware.steppers?.length || 0;
    const ioCount = config.hardware.pins?.length || 0;

    return { servosCount, steppersCount, ioCount };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950">
        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="container mx-auto p-4 md:p-6">
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Motor Configurations
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Select a saved configuration or create a new one
            </p>
          </div>

          <Button
            className="flex items-center gap-2 bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 rounded-lg shadow-md hover:shadow-lg transition-all"
            onClick={() => {
              setNewConfigName("");
              setNewConfigDescription("");
              setErrorMessage(null);
              setIsNewConfigOpen(true);
            }}
            disabled={isProcessing}
          >
            <PlusCircle className="h-4 w-4" />
            New Configuration
          </Button>
        </header>

        <AnimatePresence>
          {errorMessage && (
            <motion.div
              key="error-msg-global"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-md bg-red-500/10 backdrop-blur-sm text-red-600 dark:text-red-300 text-sm border border-red-500/20"
            >
              {errorMessage}
            </motion.div>
          )}
          {infoMessage && (
            <motion.div
              key="info-msg-global"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-md bg-blue-500/10 backdrop-blur-sm text-blue-600 dark:text-blue-300 text-sm border border-blue-500/20"
            >
              {infoMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {configurations.length === 0 && !errorMessage ? (
          <div className="text-center py-12 backdrop-blur-sm bg-white/30 dark:bg-gray-800/30 rounded-xl border border-white/20 dark:border-gray-700/30 shadow-lg">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
              No Configurations Found
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Create your first motor configuration to get started
            </p>
            <Button
              onClick={() => {
                setNewConfigName("");
                setNewConfigDescription("");
                setErrorMessage(null);
                setIsNewConfigOpen(true);
              }}
              disabled={isProcessing}
              className="bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 rounded-lg shadow-md hover:shadow-lg transition-all"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Configuration
            </Button>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {configurations.map((config) => {
              const summary = getHardwareSummary(config);
              return (
                <motion.div
                  key={config._id}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="group"
                >
                  <div className="backdrop-blur-md bg-white/70 dark:bg-gray-800/50 rounded-xl border border-white/20 dark:border-gray-700/30 shadow-lg hover:shadow-xl transition-all p-6 h-full flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <h3
                        className="text-xl font-semibold text-gray-900 dark:text-white truncate pr-2"
                        title={config.name}
                      >
                        {config.name}
                      </h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex-shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            disabled={isProcessing}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 rounded-lg shadow-lg"
                        >
                          <DropdownMenuItem
                            className="hover:bg-gray-100/80 dark:hover:bg-gray-700/80 cursor-pointer rounded-md transition-colors"
                            onClick={() => {
                              setEditingConfigId(config._id);
                              setEditingConfigName(config.name);
                              setConfigDescription(config.description || "");
                              setErrorMessage(null);
                              setIsDescriptionDialogOpen(true);
                            }}
                            disabled={isProcessing}
                          >
                            <Info className="h-4 w-4 mr-2" />
                            Edit Description
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="hover:bg-gray-100/80 dark:hover:bg-gray-700/80 cursor-pointer rounded-md transition-colors"
                            onClick={() => {
                              setRenamingConfigId(config._id);
                              setRenamingConfigCurrentName(config.name);
                              setConfigNewName(config.name);
                              setErrorMessage(null);
                              setIsRenameDialogOpen(true);
                            }}
                            disabled={isProcessing}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setDeletingConfigId(config._id);
                              setDeletingConfigName(config.name);
                              setIsDeleteDialogOpen(true);
                            }}
                            className="text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-500 hover:bg-red-50/80 dark:hover:bg-red-900/30 cursor-pointer rounded-md transition-colors"
                            disabled={isProcessing}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex-1 mb-4">
                      {config.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
                          {config.description}
                        </p>
                      )}

                      {/* Hardware Summary */}
                      {summary && (
                        <div className="flex gap-3 mb-3">
                          {summary.steppersCount > 0 && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded-md text-blue-800 dark:text-blue-300">
                              {summary.steppersCount} Steppers
                            </span>
                          )}
                          {summary.servosCount > 0 && (
                            <span className="text-xs bg-green-100 dark:bg-green-900/40 px-2 py-1 rounded-md text-green-800 dark:text-green-300">
                              {summary.servosCount} Servos
                            </span>
                          )}
                          {summary.ioCount > 0 && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/40 px-2 py-1 rounded-md text-purple-800 dark:text-purple-300">
                              {summary.ioCount} IO Pins
                            </span>
                          )}
                        </div>
                      )}

                      {/* Last Modified */}
                      {config.updatedAt && (
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                          <CalendarClock className="h-3 w-3 mr-1 opacity-70" />
                          <span>
                            Last modified: {formatDate(config.updatedAt)}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <Settings className="h-3 w-3 mr-1 opacity-70" />
                        <span className="truncate">{config._id}</span>
                      </div>
                    </div>

                    <Button
                      className="w-full flex justify-between items-center bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 rounded-lg shadow-md hover:shadow-lg transition-all"
                      onClick={() => handleLoadConfig(config._id)}
                      disabled={isProcessing}
                    >
                      <span>Open Configuration</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <Dialog open={isNewConfigOpen} onOpenChange={setIsNewConfigOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Create New Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label
                htmlFor="config-name"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Configuration Name
              </Label>
              <Input
                id="config-name"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                placeholder="My Motor Configuration"
                className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg"
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !isProcessing &&
                    newConfigName.trim()
                  )
                    handleCreateConfig();
                }}
                disabled={isProcessing}
              />
            </div>

            <div>
              <Label
                htmlFor="config-description"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Description (Optional)
              </Label>
              <textarea
                id="config-description"
                value={newConfigDescription}
                onChange={(e) => setNewConfigDescription(e.target.value)}
                placeholder="Brief description of this configuration"
                className="w-full h-20 bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isProcessing}
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-red-600 dark:text-red-400 pt-1">
                {errorMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="text-gray-700 dark:text-gray-300 border-gray-300/50 dark:border-gray-600/50 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleCreateConfig}
              disabled={!newConfigName.trim() || isProcessing}
              className="bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg shadow-md"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isProcessing ? "Creating..." : "Create & Open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRenameDialogOpen}
        onOpenChange={(open) => {
          setIsRenameDialogOpen(open);
          if (!open) {
            setErrorMessage(null);
            setRenamingConfigId(null);
            setRenamingConfigCurrentName("");
            setConfigNewName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Rename Configuration
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Change the name for '{renamingConfigCurrentName}'.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-start gap-4">
              <Label
                htmlFor="rename-config-name"
                className="text-right text-sm pt-2.5 text-gray-700 dark:text-gray-300"
              >
                New Name
              </Label>
              <div className="col-span-3">
                <Input
                  id="rename-config-name"
                  value={configNewName}
                  onChange={(e) => setConfigNewName(e.target.value)}
                  className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg focus-visible:ring-blue-500"
                  disabled={isProcessing}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !isProcessing &&
                      configNewName.trim() &&
                      configNewName.trim() !== renamingConfigCurrentName
                    )
                      handleRenameConfig();
                  }}
                />
                {errorMessage && (
                  <p className="text-sm text-red-600 dark:text-red-400 pt-1">
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="text-gray-700 dark:text-gray-300 border-gray-300/50 dark:border-gray-600/50 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleRenameConfig}
              disabled={
                isProcessing ||
                !configNewName.trim() ||
                configNewName.trim() === renamingConfigCurrentName
              }
              className="bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg shadow-md"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isProcessing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              This action cannot be undone. This will permanently delete the
              <strong className="text-red-500 dark:text-red-400">
                {" "}
                '{deletingConfigName}'{" "}
              </strong>
              configuration from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button
                variant="outline"
                className="text-gray-700 dark:text-gray-300 border-gray-300/50 dark:border-gray-600/50 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                className="bg-red-600/90 hover:bg-red-700 text-white disabled:opacity-50 rounded-lg shadow-md"
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteConfig();
                }}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {isProcessing ? "Deleting..." : "Yes, Delete Configuration"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Description Dialog */}
      <Dialog
        open={isDescriptionDialogOpen}
        onOpenChange={setIsDescriptionDialogOpen}
      >
        <DialogContent className="sm:max-w-[525px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Edit Configuration Description
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Update the description for '{editingConfigName}'.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label
                htmlFor="config-description"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Description
              </Label>
              <textarea
                id="config-description"
                value={configDescription}
                onChange={(e) => setConfigDescription(e.target.value)}
                placeholder="Brief description of this configuration"
                className="w-full h-24 bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isProcessing}
              />
            </div>
            {errorMessage && (
              <p className="text-sm text-red-600 dark:text-red-400 pt-1">
                {errorMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="text-gray-700 dark:text-gray-300 border-gray-300/50 dark:border-gray-600/50 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleUpdateDescription}
              disabled={isProcessing}
              className="bg-blue-600/90 hover:bg-blue-700 text-white dark:bg-blue-700/90 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg shadow-md"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isProcessing ? "Saving..." : "Save Description"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
