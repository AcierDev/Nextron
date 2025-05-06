"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Edit,
  Trash2,
  MoreVertical,
  ChevronRight,
  Loader2,
  Pencil,
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

// Updated Configuration type to match 'get-configs' response
type ConfigListItem = {
  _id: string;
  name: string;
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
      const newConfig = await window.ipc.invoke("create-config", trimmedName);
      if (!newConfig || !newConfig._id) {
        throw new Error("Backend did not return a valid new configuration.");
      }
      setConfigurations((prev) =>
        [...prev, { _id: newConfig._id, name: newConfig.name }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setNewConfigName("");
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
      setIsDeleteDialogOpen(false);
      setDeletingConfigId(null);
      setDeletingConfigName("");
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
            className="flex items-center gap-2"
            onClick={() => {
              setNewConfigName("");
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
              className="mb-4 p-3 rounded-md bg-red-900/50 text-red-200 text-sm"
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
              className="mb-4 p-3 rounded-md bg-blue-900/50 text-blue-200 text-sm"
            >
              {infoMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {configurations.length === 0 && !errorMessage ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
              No Configurations Found
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Create your first motor configuration to get started
            </p>
            <Button
              onClick={() => {
                setNewConfigName("");
                setErrorMessage(null);
                setIsNewConfigOpen(true);
              }}
              disabled={isProcessing}
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
            {configurations.map((config) => (
              <motion.div
                key={config._id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <Card
                  key={config._id}
                  className="shadow-md hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
                >
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <CardTitle
                        className="text-xl text-gray-900 dark:text-white truncate pr-2"
                        title={config.name}
                      >
                        {config.name}
                      </CardTitle>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex-shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            disabled={isProcessing}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                        >
                          <DropdownMenuItem
                            className="hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
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
                            className="text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer"
                            disabled={isProcessing}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ID: {config._id}
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full flex justify-between items-center bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleLoadConfig(config._id)}
                      disabled={isProcessing}
                    >
                      <span>Open Configuration</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <Dialog open={isNewConfigOpen} onOpenChange={setIsNewConfigOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
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
                className="bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
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
                className="text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleCreateConfig}
              disabled={!newConfigName.trim() || isProcessing}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
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
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
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
                  className="bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus-visible:ring-blue-500"
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
                className="text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
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
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
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
        <AlertDialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
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
                className="text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                onClick={handleDeleteConfig}
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
    </div>
  );
}
