import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Sequence, SequenceStep } from "../../common/types";

// Define the types for our sequence state
interface SequenceRunState {
  isRunning: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  totalSteps: number;
  sequenceId: string | null;
  sequenceName: string | null;
  speedMultiplier: number;
}

const initialRunState: SequenceRunState = {
  isRunning: false,
  isPaused: false,
  currentStepIndex: -1,
  totalSteps: 0,
  sequenceId: null,
  sequenceName: null,
  speedMultiplier: 1.0,
};

export const useSequenceRunner = () => {
  const [runState, setRunState] = useState<SequenceRunState>(initialRunState);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Update the local state when we receive sequence updates from the main process
  useEffect(() => {
    const handleSequenceUpdate = (_event: any, data: any) => {
      console.log("Received sequence update:", data);

      if (data?.type === "sequence-event") {
        switch (data.event) {
          case "step-start":
            setRunState((prev) => ({
              ...prev,
              currentStepIndex: data.currentStepIndex,
              totalSteps: data.totalSteps,
            }));
            break;

          case "step-complete":
            // Only update the step info for now
            break;

          case "completed":
            toast({
              title: "Sequence Completed",
              description: `"${data.name}" has completed successfully.`,
            });
            setRunState(initialRunState);
            break;

          case "paused":
            setRunState((prev) => ({ ...prev, isPaused: true }));
            toast({
              title: "Sequence Paused",
              description: "Sequence execution has been paused.",
            });
            break;

          case "resumed":
            setRunState((prev) => ({ ...prev, isPaused: false }));
            toast({
              title: "Sequence Resumed",
              description: "Sequence execution has been resumed.",
            });
            break;

          case "stopped":
            toast({
              title: "Sequence Stopped",
              description: "Sequence execution has been stopped.",
            });
            setRunState(initialRunState);
            break;

          case "error":
            toast({
              title: "Sequence Error",
              description:
                data.error || "An error occurred during sequence execution.",
              variant: "destructive",
            });
            setError(data.error);
            setRunState(initialRunState);
            break;

          case "speed-changed":
            setRunState((prev) => ({
              ...prev,
              speedMultiplier: data.speedMultiplier,
            }));
            break;
        }
      }
    };

    // Listen for sequence updates from the main process
    const cleanup = window.ipc.on("sequence-update", handleSequenceUpdate);

    // Clean up the listener on unmount
    return () => {
      cleanup();
    };
  }, [toast]);

  // Function to start running a sequence
  const runSequence = useCallback(
    async (
      sequence: Sequence,
      startAtIndex: number = 0,
      speedMultiplier: number = 1.0
    ) => {
      try {
        setError(null);

        const result = await window.ipc.invoke(
          "start-sequence",
          sequence,
          startAtIndex,
          speedMultiplier
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to start sequence");
        }

        setRunState({
          isRunning: true,
          isPaused: false,
          currentStepIndex: startAtIndex,
          totalSteps: sequence.steps.length,
          sequenceId: sequence.id,
          sequenceName: sequence.name,
          speedMultiplier,
        });

        toast({
          title: "Sequence Started",
          description: `Running "${sequence.name}"`,
        });

        return true;
      } catch (err) {
        console.error("Error starting sequence:", err);
        setError(err.message || "Failed to start sequence");
        toast({
          title: "Failed to Start Sequence",
          description: err.message || "An unknown error occurred",
          variant: "destructive",
        });
        return false;
      }
    },
    [toast]
  );

  // Function to pause a running sequence
  const pauseSequence = useCallback(async () => {
    try {
      const result = await window.ipc.invoke("pause-sequence");

      if (!result.success) {
        throw new Error(result.error || "Failed to pause sequence");
      }

      return true;
    } catch (err) {
      console.error("Error pausing sequence:", err);
      setError(err.message || "Failed to pause sequence");
      toast({
        title: "Failed to Pause Sequence",
        description: err.message || "An unknown error occurred",
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  // Function to resume a paused sequence
  const resumeSequence = useCallback(async () => {
    try {
      const result = await window.ipc.invoke("resume-sequence");

      if (!result.success) {
        throw new Error(result.error || "Failed to resume sequence");
      }

      return true;
    } catch (err) {
      console.error("Error resuming sequence:", err);
      setError(err.message || "Failed to resume sequence");
      toast({
        title: "Failed to Resume Sequence",
        description: err.message || "An unknown error occurred",
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  // Function to stop a running sequence
  const stopSequence = useCallback(async () => {
    try {
      const result = await window.ipc.invoke("stop-sequence");

      if (!result.success && runState.isRunning) {
        throw new Error(result.error || "Failed to stop sequence");
      }

      return true;
    } catch (err) {
      console.error("Error stopping sequence:", err);
      setError(err.message || "Failed to stop sequence");
      toast({
        title: "Failed to Stop Sequence",
        description: err.message || "An unknown error occurred",
        variant: "destructive",
      });
      return false;
    }
  }, [runState.isRunning, toast]);

  // Function to set the playback speed
  const setPlaybackSpeed = useCallback(
    async (speed: number) => {
      try {
        const result = await window.ipc.invoke("set-sequence-speed", speed);

        if (!result.success) {
          throw new Error(result.error || "Failed to set sequence speed");
        }

        setRunState((prev) => ({ ...prev, speedMultiplier: speed }));
        return true;
      } catch (err) {
        console.error("Error setting playback speed:", err);
        setError(err.message || "Failed to set playback speed");
        toast({
          title: "Failed to Set Playback Speed",
          description: err.message || "An unknown error occurred",
          variant: "destructive",
        });
        return false;
      }
    },
    [toast]
  );

  // Function to get the current sequence run state
  const refreshState = useCallback(async () => {
    try {
      const state = await window.ipc.invoke("get-sequence-state");
      setRunState(state);
      return state;
    } catch (err) {
      console.error("Error getting sequence state:", err);
      return runState;
    }
  }, [runState]);

  // Clear any error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    ...runState,
    error,
    runSequence,
    pauseSequence,
    resumeSequence,
    stopSequence,
    setPlaybackSpeed,
    refreshState,
    clearError,
  };
};
