#ifndef STEPPER_H
#define STEPPER_H

#include <AsyncWebSocket.h>

#include "../config.h"

// --- Stepper Motor Operations ---

// Initialize a stepper motor with the given configuration
bool initializeStepper(StepperConfig& config);

// Clean up a stepper motor (stop, disable, etc.)
void cleanupStepper(StepperConfig& config);

// Move stepper to absolute position (with limits)
bool moveStepperToPosition(StepperConfig& config, long position);

// Move stepper by relative steps (with limits)
bool moveStepperRelative(StepperConfig& config, long steps);

// Stop stepper motor immediately
void stopStepper(StepperConfig& config);

// Set current position (logical position)
bool setStepperCurrentPosition(StepperConfig& config, long position);

// Start homing sequence for stepper with sensor
bool homeStepperWithSensor(StepperConfig& config);

// Helper to clamp a position within the stepper's limits
long clampPosition(StepperConfig* stepper, long position);

// --- WebSocket Communication ---

// Send JSON error message for when a stepper is not found
void sendStepperNotFoundError(AsyncWebSocketClient* client, const String& id);

// Send position update for a stepper
void sendStepperPositionUpdate(const StepperConfig& config);

// Send action completion notification
void sendStepperActionComplete(const StepperConfig& config, bool success,
                               const String& errorMsg = "");

// --- Periodic Updates ---

// Update and report stepper positions, check for completion of moves and homing
void updateStepperPositions();

#endif  // STEPPER_H