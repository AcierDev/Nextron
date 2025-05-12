#ifndef SERVO_H
#define SERVO_H

#include <AsyncWebSocket.h>

#include "../config.h"

// Initialize a servo based on its configuration
void initializeServo(ServoConfig &servoConfig);

// Clean up a servo (e.g., before reconfiguration or removal)
void cleanupServo(ServoConfig &servoConfig);

// Check if an angle is within the servo's range
bool isValidAngle(ServoConfig &servoConfig, int angle);

// Move servo to a specified angle
bool moveServo(ServoConfig &servoConfig, int angle);

// Send error message for when a servo is not found
void sendServoNotFoundError(AsyncWebSocketClient *client, const String &id);

// Update servo action status (for tracking motion completion)
void updateServoActionStatus();

#endif  // SERVO_H