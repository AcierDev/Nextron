import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Plus,
  PlayCircle,
  Edit,
  Trash2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Sequence } from "../../common/types";
import { useSequenceRunner } from "@/hooks/use-sequence-runner";
import { SequenceRunnerStatus } from "@/components/sequence-runner/sequence-runner-status";

// Dynamically import the SequencePage component to avoid SSR issues
const SequencePage = dynamic(
  () => import("@/components/sequence-recorder/sequence-page"),
  { ssr: false }
);

export default function SequencesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configId = searchParams.get("config");
  const sequenceId = searchParams.get("id");
  const { toast } = useToast();
  const sequenceRunner = useSequenceRunner();

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Load sequences for this configuration from MongoDB
  useEffect(() => {
    if (!configId) {
      toast({
        title: "Configuration ID missing",
        description: "Cannot load sequences without a configuration ID",
        variant: "destructive",
      });
      router.push("/configurations");
      return;
    }

    async function loadSequences() {
      try {
        setIsLoading(true);
        const configData = await window.ipc.invoke(
          "get-config-by-id",
          configId
        );

        if (!configData) {
          throw new Error("Configuration not found");
        }

        setSequences(configData.sequences || []);
      } catch (error) {
        console.error("Failed to load sequences:", error);
        toast({
          title: "Error loading sequences",
          description: error.message || "An unknown error occurred",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadSequences();
  }, [configId, router, toast]);

  // Check if any sequence is currently running
  useEffect(() => {
    if (sequenceRunner.isRunning) {
      // Refresh run state when returning to the page
      sequenceRunner.refreshState();
    }
  }, [sequenceRunner]);

  // Handle sequence deletion
  const handleDeleteSequence = async (sequenceId: string) => {
    if (!configId) return;

    try {
      setIsDeleting(sequenceId);

      // Get the current config data with sequences
      const configData = await window.ipc.invoke("get-config-by-id", configId);

      if (!configData || !configData.sequences) {
        throw new Error("Configuration or sequences not found");
      }

      // Filter out the sequence to delete
      const updatedSequences = configData.sequences.filter(
        (seq) => seq.id !== sequenceId
      );

      // Update the configuration with the new sequences array
      await window.ipc.invoke("update-config", configId, {
        sequences: updatedSequences,
      });

      // Update the UI
      setSequences(updatedSequences);

      toast({
        title: "Sequence deleted",
        description: "The sequence has been removed successfully",
      });
    } catch (error) {
      console.error("Failed to delete sequence:", error);
      toast({
        title: "Error deleting sequence",
        description: error.message || "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
    }
  };

  // Run a sequence
  const handleRunSequence = async (sequence: Sequence) => {
    // Check if we have a connection before running
    try {
      const connectionStatus = await window.ipc.invoke("get-connection-status");

      if (!connectionStatus.connected) {
        toast({
          title: "Connection Required",
          description:
            "Please connect to the CNC device before running a sequence.",
          variant: "destructive",
        });
        return;
      }

      // Start the sequence
      await sequenceRunner.runSequence(sequence);
    } catch (error) {
      console.error("Failed to check connection status:", error);
      toast({
        title: "Connection Error",
        description:
          error.message || "An error occurred checking the connection status.",
        variant: "destructive",
      });
    }
  };

  // If sequence ID is provided, show the sequence editor
  if (sequenceId) {
    return <SequencePage />;
  }

  // Otherwise show the sequences list
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <Head>
        <title>Sequences | Everwood CNC</title>
      </Head>

      <div className="container mx-auto p-4 md:p-6">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push(`/dashboard?config=${configId}`)}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Sequences
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Create and manage motor sequences
              </p>
            </div>
          </div>

          <Button
            onClick={() =>
              router.push(`/sequences?config=${configId}&id=new-sequence`)
            }
            className="flex items-center gap-2 bg-blue-600/90 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" />
            New Sequence
          </Button>
        </header>

        {/* Add sequence runner status component */}
        {sequenceRunner.isRunning && (
          <div className="mb-6">
            <SequenceRunnerStatus />
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-gray-500 dark:text-gray-400">
              Loading sequences...
            </p>
          </div>
        ) : sequences.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
              No Sequences Created
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Create your first sequence to automate your CNC operations
            </p>
            <Button
              onClick={() =>
                router.push(`/sequences?config=${configId}&id=new-sequence`)
              }
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Sequence
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sequences.map((sequence) => (
              <Card
                key={sequence.id}
                className="p-4 backdrop-blur-sm bg-white/70 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50"
              >
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1">
                      {sequence.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {sequence.description}
                    </p>
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                      <span>{sequence.steps.length} steps</span>
                      <span className="mx-2">•</span>
                      <span>
                        Updated{" "}
                        {new Date(sequence.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() =>
                        router.push(
                          `/sequences?config=${configId}&id=${sequence.id}`
                        )
                      }
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 border-red-200 hover:border-red-300 hover:text-red-600"
                        onClick={() => handleDeleteSequence(sequence.id)}
                        disabled={isDeleting === sequence.id}
                      >
                        {isDeleting === sequence.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        className={`${
                          sequenceRunner.isRunning &&
                          sequenceRunner.sequenceId === sequence.id
                            ? "bg-yellow-600 hover:bg-yellow-700"
                            : "bg-green-600 hover:bg-green-700"
                        } text-white`}
                        onClick={() => handleRunSequence(sequence)}
                        disabled={
                          sequenceRunner.isRunning &&
                          sequenceRunner.sequenceId !== sequence.id
                        }
                      >
                        {sequenceRunner.isRunning &&
                        sequenceRunner.sequenceId === sequence.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-3.5 w-3.5 mr-1" />
                            Run
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
