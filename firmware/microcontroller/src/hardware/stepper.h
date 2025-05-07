#ifndef STEPPER_H
#define STEPPER_H

#include <AsyncWebSocket.h>

#include "../config.h"

// Helper to clamp a position within the stepper's limits
long clampPosition(StepperConfig *stepper, long position);

// Send JSON error message for when a stepper is not found
void sendStepperNotFoundError(AsyncWebSocketClient *client, const String &id);

// Update and report stepper positions
void updateStepperPositions();

#endif  // STEPPER_H