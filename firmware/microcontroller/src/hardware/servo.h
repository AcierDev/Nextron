#ifndef SERVO_H
#define SERVO_H

#include <ArduinoJson.h>
#include <AsyncWebSocket.h>

#include "../config.h"

// --- Servo Motor Operations ---

// Initialize a servo based on its configuration
void initializeServo(ServoConfig &servoConfig);

// Clean up a servo (e.g., before reconfiguration or removal)
void cleanupServo(ServoConfig &servoConfig);

// Check if an angle is within the servo's range
bool isValidAngle(ServoConfig &servoConfig, int angle);

// Move servo to a specified angle
bool moveServo(ServoConfig &servoConfig, int angle);

// --- WebSocket Communication ---

// Send error message for when a servo is not found
void sendServoNotFoundError(AsyncWebSocketClient *client, const String &id);

// Handle servo-related WebSocket messages
void handleServoMessage(AsyncWebSocketClient *client, JsonDocument &doc);

// Send action completion notification
void sendServoActionComplete(const ServoConfig &config, bool success,
                             const String &errorMsg = "");

// --- Periodic Updates ---

// Update servo action status (for tracking motion completion)
void updateServoActionStatus();

#endif  // SERVO_H