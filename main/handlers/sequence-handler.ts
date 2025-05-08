import { ipcMain, BrowserWindow } from "electron";
import {
  Sequence,
  SequenceStep,
  ActionStep,
  DelayStep,
} from "../../common/types";
import { sendMessage } from "./connection-handler"; // Import the sendMessage function
import createLogger from "../lib/logger"; // Import our new logger utility

// Create a logger instance for the Sequence Handler
const logger = createLogger("Sequence Handler");

// Track currently running sequence state
type SequenceRunState = {
  sequence: Sequence | null;
  currentStepIndex: number;
  isRunning: boolean;
  isPaused: boolean;
  stepTimer: NodeJS.Timeout | null;
  speedMultiplier: number;
  waitingForActionComplete: boolean; // Add flag to track if we're waiting for an action to complete
  currentActionCommandId: string | null; // Add field to track current action command ID
};

const sequenceRunState: SequenceRunState = {
  sequence: null,
  currentStepIndex: -1,
  isRunning: false,
  isPaused: false,
  stepTimer: null,
  speedMultiplier: 1.0,
  waitingForActionComplete: false,
  currentActionCommandId: null,
};

/**
 * Reset the sequence state
 */
function resetSequenceState() {
  if (sequenceRunState.stepTimer) {
    clearTimeout(sequenceRunState.stepTimer);
  }

  sequenceRunState.sequence = null;
  sequenceRunState.currentStepIndex = -1;
  sequenceRunState.isRunning = false;
  sequenceRunState.isPaused = false;
  sequenceRunState.stepTimer = null;
  sequenceRunState.speedMultiplier = 1.0;
  sequenceRunState.waitingForActionComplete = false;
  sequenceRunState.currentActionCommandId = null;
}

/**
 * Start running a sequence
 */
async function startSequence(
  sequence: Sequence,
  startAtIndex: number = 0,
  speedMultiplier: number = 1.0
) {
  if (!sequence || !sequence.steps || sequence.steps.length === 0) {
    return { success: false, error: "Invalid sequence or empty steps" };
  }

  // Stop any currently running sequence
  stopSequence();

  // Set up new sequence run
  sequenceRunState.sequence = sequence;
  sequenceRunState.currentStepIndex = startAtIndex - 1; // Will be incremented before first execution
  sequenceRunState.isRunning = true;
  sequenceRunState.isPaused = false;
  sequenceRunState.speedMultiplier = speedMultiplier;

  // Start processing sequence steps
  return processNextStep();
}

/**
 * Process the next step in the sequence
 */
async function processNextStep(): Promise<{
  success: boolean;
  error?: string;
  currentStep?: number;
}> {
  if (!sequenceRunState.sequence || !sequenceRunState.isRunning) {
    return { success: false, error: "No active sequence" };
  }

  // Increment to next step
  sequenceRunState.currentStepIndex++;

  // Check if we've completed all steps
  if (
    sequenceRunState.currentStepIndex >= sequenceRunState.sequence.steps.length
  ) {
    logger.success("Sequence completed");

    // Send sequence completed notification
    const completedEvent = {
      type: "sequence-event",
      event: "completed",
      sequenceId: sequenceRunState.sequence.id,
      name: sequenceRunState.sequence.name,
    };

    // Broadcast to all renderer processes
    broadcastSequenceUpdate(completedEvent);

    // Reset sequence state
    resetSequenceState();

    return { success: true, currentStep: -1 };
  }

  const currentStep =
    sequenceRunState.sequence.steps[sequenceRunState.currentStepIndex];
  logger.info(
    `Processing step ${sequenceRunState.currentStepIndex} of type ${currentStep.type}`
  );

  try {
    // Broadcast the current step info to all renderer processes
    broadcastSequenceUpdate({
      type: "sequence-event",
      event: "step-start",
      sequenceId: sequenceRunState.sequence.id,
      currentStepIndex: sequenceRunState.currentStepIndex,
      totalSteps: sequenceRunState.sequence.steps.length,
      stepData: currentStep,
    });

    // Process step based on type
    if (currentStep.type === "delay") {
      await handleDelayStep(currentStep as DelayStep);
    } else if (currentStep.type === "action") {
      await handleActionStep(currentStep as ActionStep);
    }

    return {
      success: true,
      currentStep: sequenceRunState.currentStepIndex,
    };
  } catch (error) {
    logger.error("Error processing step:", error);

    // Broadcast error event
    broadcastSequenceUpdate({
      type: "sequence-event",
      event: "error",
      sequenceId: sequenceRunState.sequence.id,
      currentStepIndex: sequenceRunState.currentStepIndex,
      error: error.message || "Error processing step",
    });

    // Stop the sequence on error
    stopSequence();

    return {
      success: false,
      error: `Error processing step: ${error.message}`,
      currentStep: sequenceRunState.currentStepIndex,
    };
  }
}

/**
 * Handle a delay step by waiting for the specified duration
 */
function handleDelayStep(step: DelayStep): Promise<void> {
  return new Promise((resolve) => {
    // Calculate actual delay time based on speed multiplier
    const adjustedDuration = Math.round(
      step.duration / sequenceRunState.speedMultiplier
    );
    logger.info(`Delay step - waiting for ${adjustedDuration}ms`);

    // Set timer for the delay
    sequenceRunState.stepTimer = setTimeout(() => {
      // If sequence was stopped during timeout, don't proceed
      if (!sequenceRunState.isRunning) {
        resolve();
        return;
      }

      // Broadcast step complete and continue
      broadcastSequenceUpdate({
        type: "sequence-event",
        event: "step-complete",
        sequenceId: sequenceRunState.sequence.id,
        currentStepIndex: sequenceRunState.currentStepIndex,
      });

      // Clear timer reference
      sequenceRunState.stepTimer = null;

      // Continue to next step if sequence is still running
      if (sequenceRunState.isRunning && !sequenceRunState.isPaused) {
        processNextStep();
      }

      resolve();
    }, adjustedDuration);
  });
}

/**
 * Helper function to wait for a specific command to be completed.
 * Relies on handleActionCompletionMessage to update sequenceRunState.
 */
function waitForCommandCompletion(
  commandId: string,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    sequenceRunState.waitingForActionComplete = true;
    sequenceRunState.currentActionCommandId = commandId;
    logger.debug(`Waiting for command: ${commandId}, timeout: ${timeoutMs}ms`);

    const timeoutHandle = setTimeout(() => {
      if (
        sequenceRunState.currentActionCommandId === commandId &&
        sequenceRunState.waitingForActionComplete
      ) {
        logger.warn(`Command ${commandId} timed out after ${timeoutMs}ms`);
        sequenceRunState.waitingForActionComplete = false;
        sequenceRunState.currentActionCommandId = null;
        reject(new Error(`Command ${commandId} timed out`));
      }
    }, timeoutMs);

    const checkInterval = setInterval(() => {
      if (!sequenceRunState.isRunning) {
        logger.warn(`Sequence stopped while waiting for command ${commandId}`);
        clearInterval(checkInterval);
        clearTimeout(timeoutHandle);
        reject(new Error("Sequence stopped"));
        return;
      }
      if (
        sequenceRunState.currentActionCommandId !== commandId &&
        !sequenceRunState.waitingForActionComplete
      ) {
        logger.debug(`Command ${commandId} considered complete or superseded.`);
        clearInterval(checkInterval);
        clearTimeout(timeoutHandle);
        resolve();
      }
    }, 100);
  });
}

/**
 * Handle an action step by sending appropriate command to the device
 */
async function handleActionStep(step: ActionStep): Promise<void> {
  const ACTION_TIMEOUT = 30000; // 30 seconds for main action command

  // Construct the message based on the component group and action
  const mainCommandId = `cmd_main_${Date.now()}_${Math.floor(
    Math.random() * 1000
  )}`;

  let message: any;

  // Format the message correctly based on component group and action
  if (step.deviceComponentGroup === "steppers") {
    // Format for stepper motors
    if (step.action === "moveTo") {
      message = {
        action: "control",
        componentGroup: "steppers",
        id: step.deviceId,
        command: "move",
        value: step.value,
        commandId: mainCommandId,
      };
    } else if (step.action === "step") {
      message = {
        action: "control",
        componentGroup: "steppers",
        id: step.deviceId,
        command: "step",
        value: step.value,
        commandId: mainCommandId,
      };
    } else if (step.action === "setSpeed") {
      message = {
        action: "control",
        componentGroup: "steppers",
        id: step.deviceId,
        command: "setParams",
        speed: step.value,
        commandId: mainCommandId,
      };
    } else if (step.action === "setAcceleration") {
      message = {
        action: "control",
        componentGroup: "steppers",
        id: step.deviceId,
        command: "setParams",
        acceleration: step.value,
        commandId: mainCommandId,
      };
    } else {
      // Default format if action is not recognized
      message = {
        action: step.action,
        componentId: step.deviceId,
        componentGroup: step.deviceComponentGroup,
        value: step.value,
        commandId: mainCommandId,
      };
    }
  } else if (step.deviceComponentGroup === "servos") {
    // Format for servo motors
    if (step.action === "setAngle") {
      message = {
        action: "control",
        componentGroup: "servos",
        id: step.deviceId,
        command: "setAngle",
        value: step.value,
        commandId: mainCommandId,
      };
    } else {
      // Default format if action is not recognized
      message = {
        action: step.action,
        componentId: step.deviceId,
        componentGroup: step.deviceComponentGroup,
        value: step.value,
        commandId: mainCommandId,
      };
    }
  } else {
    // Default format for other component types
    message = {
      action: step.action,
      componentId: step.deviceId,
      componentGroup: step.deviceComponentGroup,
      value: step.value,
      commandId: mainCommandId,
    };
  }

  // Add speed and acceleration if provided
  if (step.speed !== undefined) message.speed = step.speed;
  if (step.acceleration !== undefined) message.acceleration = step.acceleration;

  logger.info(`Action step - sending main command:`, message);
  const mainSendSuccess = sendMessage(message);

  if (!mainSendSuccess) {
    throw new Error("Failed to send main action message to device");
  }

  // Broadcast step-start for the main action
  broadcastSequenceUpdate({
    type: "sequence-event",
    event: "step-start",
    sequenceId: sequenceRunState.sequence!.id, // sequence should be non-null if isRunning
    currentStepIndex: sequenceRunState.currentStepIndex,
    stepData: step,
  });

  // Wait for the main action command to complete
  try {
    await waitForCommandCompletion(mainCommandId, ACTION_TIMEOUT);
    logger.info(
      `Main command ${mainCommandId} for step ${sequenceRunState.currentStepIndex} acknowledged.`
    );
  } catch (actionError) {
    logger.error(
      `Main command ${mainCommandId} for step ${sequenceRunState.currentStepIndex} failed or timed out:`,
      actionError
    );
    throw actionError; // Propagate error
  }
}

/**
 * Pause the currently running sequence
 */
function pauseSequence(): { success: boolean; error?: string } {
  if (!sequenceRunState.sequence || !sequenceRunState.isRunning) {
    return { success: false, error: "No active sequence" };
  }

  logger.info("Pausing sequence");
  sequenceRunState.isPaused = true;

  // Clear any pending delay timer
  if (sequenceRunState.stepTimer) {
    clearTimeout(sequenceRunState.stepTimer);
    sequenceRunState.stepTimer = null;
  }

  // Broadcast pause event
  broadcastSequenceUpdate({
    type: "sequence-event",
    event: "paused",
    sequenceId: sequenceRunState.sequence.id,
    currentStepIndex: sequenceRunState.currentStepIndex,
  });

  return { success: true };
}

/**
 * Resume the paused sequence
 */
function resumeSequence(): { success: boolean; error?: string } {
  if (!sequenceRunState.sequence || !sequenceRunState.isRunning) {
    return { success: false, error: "No active sequence" };
  }

  if (!sequenceRunState.isPaused) {
    return { success: false, error: "Sequence is not paused" };
  }

  logger.info("Resuming sequence");
  sequenceRunState.isPaused = false;

  // Broadcast resume event
  broadcastSequenceUpdate({
    type: "sequence-event",
    event: "resumed",
    sequenceId: sequenceRunState.sequence.id,
    currentStepIndex: sequenceRunState.currentStepIndex,
  });

  // Continue processing steps
  processNextStep();

  return { success: true };
}

/**
 * Stop the currently running sequence
 */
function stopSequence(): { success: boolean; error?: string } {
  if (!sequenceRunState.sequence || !sequenceRunState.isRunning) {
    return { success: false, error: "No active sequence" };
  }

  logger.info("Stopping sequence");

  // Clear any pending delay timer
  if (sequenceRunState.stepTimer) {
    clearTimeout(sequenceRunState.stepTimer);
  }

  // Get sequence info before resetting
  const sequenceId = sequenceRunState.sequence.id;
  const currentStepIndex = sequenceRunState.currentStepIndex;

  // Reset state
  resetSequenceState();

  // Broadcast stop event
  broadcastSequenceUpdate({
    type: "sequence-event",
    event: "stopped",
    sequenceId: sequenceId,
    currentStepIndex: currentStepIndex,
  });

  return { success: true };
}

/**
 * Get the current sequence state
 */
function getSequenceRunState() {
  return {
    isRunning: sequenceRunState.isRunning,
    isPaused: sequenceRunState.isPaused,
    currentStepIndex: sequenceRunState.currentStepIndex,
    totalSteps: sequenceRunState.sequence
      ? sequenceRunState.sequence.steps.length
      : 0,
    sequenceId: sequenceRunState.sequence ? sequenceRunState.sequence.id : null,
    sequenceName: sequenceRunState.sequence
      ? sequenceRunState.sequence.name
      : null,
    speedMultiplier: sequenceRunState.speedMultiplier,
  };
}

/**
 * Set the speed multiplier for the sequence playback
 */
function setSpeedMultiplier(speedMultiplier: number): {
  success: boolean;
  error?: string;
} {
  if (speedMultiplier <= 0) {
    return { success: false, error: "Speed multiplier must be greater than 0" };
  }

  sequenceRunState.speedMultiplier = speedMultiplier;

  // Broadcast speed change event if a sequence is running
  if (sequenceRunState.sequence && sequenceRunState.isRunning) {
    broadcastSequenceUpdate({
      type: "sequence-event",
      event: "speed-changed",
      sequenceId: sequenceRunState.sequence.id,
      speedMultiplier: speedMultiplier,
    });
  }

  return { success: true };
}

/**
 * Broadcast a sequence update to all renderer processes
 */
function broadcastSequenceUpdate(data: any) {
  logger.debug(`Broadcast sequence update:`, data);

  // Send to all renderer processes
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send("sequence-update", data);
    }
  });
}

/**
 * Set up sequence handlers for IPC communication
 */
export function setupSequenceHandlers() {
  logger.info("Setting up sequence IPC handlers");

  // Start a sequence
  ipcMain.handle(
    "start-sequence",
    async (
      _,
      sequence: Sequence,
      startAtIndex: number = 0,
      speedMultiplier: number = 1.0
    ) => {
      try {
        logger.info(`Starting sequence: ${sequence.name} (${sequence.id})`);
        return await startSequence(sequence, startAtIndex, speedMultiplier);
      } catch (err) {
        logger.error("Error starting sequence:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Pause a running sequence
  ipcMain.handle("pause-sequence", () => {
    try {
      logger.info("Pausing sequence");
      return pauseSequence();
    } catch (err) {
      logger.error("Error pausing sequence:", err);
      return { success: false, error: err.message };
    }
  });

  // Resume a paused sequence
  ipcMain.handle("resume-sequence", () => {
    try {
      logger.info("Resuming sequence");
      return resumeSequence();
    } catch (err) {
      logger.error("Error resuming sequence:", err);
      return { success: false, error: err.message };
    }
  });

  // Stop a running sequence
  ipcMain.handle("stop-sequence", () => {
    try {
      logger.info("Stopping sequence");
      return stopSequence();
    } catch (err) {
      logger.error("Error stopping sequence:", err);
      return { success: false, error: err.message };
    }
  });

  // Set sequence speed multiplier
  ipcMain.handle("set-sequence-speed", (_, speedMultiplier: number) => {
    try {
      logger.info(`Setting sequence speed multiplier: ${speedMultiplier}`);
      return setSpeedMultiplier(speedMultiplier);
    } catch (err) {
      logger.error("Error setting playback speed:", err);
      return { success: false, error: err.message };
    }
  });

  // Get sequence run state
  ipcMain.handle("get-sequence-state", () => {
    try {
      return getSequenceRunState();
    } catch (err) {
      logger.error("Error getting sequence state:", err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Handle WebSocket message for action completion
 */
export function handleActionCompletionMessage(message: any) {
  // Check if we have an active sequence waiting for action completion
  if (
    !sequenceRunState.isRunning ||
    !sequenceRunState.waitingForActionComplete ||
    !sequenceRunState.currentActionCommandId
  ) {
    logger.debug(
      "Received action completion message but no sequence is waiting",
      message
    );
    return;
  }

  // Verify this is the completion for our current command
  if (
    message.commandId !== sequenceRunState.currentActionCommandId &&
    message.originalCommandId !== sequenceRunState.currentActionCommandId
  ) {
    logger.debug(
      `Ignoring action completion for different command ID. Expected: ${
        sequenceRunState.currentActionCommandId
      }, Got: ${message.commandId || message.originalCommandId}`
    );
    return;
  }

  logger.info(
    `Received action completion for command ${
      message.commandId || message.originalCommandId
    }`
  );

  // Reset waiting state
  sequenceRunState.waitingForActionComplete = false;
  sequenceRunState.currentActionCommandId = null;

  // Broadcast step complete
  broadcastSequenceUpdate({
    type: "sequence-event",
    event: "step-complete",
    sequenceId: sequenceRunState.sequence.id,
    currentStepIndex: sequenceRunState.currentStepIndex,
  });

  // Proceed to next step
  if (sequenceRunState.isRunning && !sequenceRunState.isPaused) {
    logger.debug("Proceeding to next step after action completion");
    processNextStep();
  }
}
