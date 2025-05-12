#include "servo.h"

#include <Arduino.h>
#include <ArduinoJson.h>

// Forward declaration for WebSocket instance
extern AsyncWebSocket ws;

// Initialize a servo based on its configuration
void initializeServo(ServoConfig &servoConfig) {
  // Clean up any existing attachment
  if (servoConfig.isAttached) {
    servoConfig.servo.detach();
    servoConfig.isAttached = false;
  }

  // Set PWM parameters (standard 50Hz servo frequency)
  servoConfig.servo.setPeriodHertz(50);

  // Attach servo to pin with pulse width limits
  servoConfig.servo.attach(servoConfig.pin, servoConfig.minPulseWidth,
                           servoConfig.maxPulseWidth);

  // Check if attachment was successful
  servoConfig.isAttached = servoConfig.servo.attached();

  // Move to initial position if attached
  if (servoConfig.isAttached) {
    servoConfig.servo.write(servoConfig.currentAngle);
  }

  Serial.printf("Servo %s: Initialized on pin %d, attached=%s\n",
                servoConfig.id.c_str(), servoConfig.pin,
                servoConfig.isAttached ? "true" : "false");
}

// Clean up a servo (e.g., before reconfiguration or removal)
void cleanupServo(ServoConfig &servoConfig) {
  if (servoConfig.isAttached) {
    servoConfig.servo.detach();
    servoConfig.isAttached = false;
  }
}

// Check if an angle is within the servo's range
bool isValidAngle(ServoConfig &servoConfig, int angle) {
  return (angle >= servoConfig.minAngle && angle <= servoConfig.maxAngle);
}

// Move servo to a specified angle
bool moveServo(ServoConfig &servoConfig, int angle) {
  // Validate angle
  if (!isValidAngle(servoConfig, angle)) {
    Serial.printf("Servo %s: Invalid angle %d (range: %d-%d)\n",
                  servoConfig.id.c_str(), angle, servoConfig.minAngle,
                  servoConfig.maxAngle);
    return false;
  }

  // Ensure servo is attached
  if (!servoConfig.isAttached) {
    initializeServo(servoConfig);

    if (!servoConfig.isAttached) {
      Serial.printf("Servo %s: Failed to attach during move\n",
                    servoConfig.id.c_str());
      return false;
    }
  }

  // Save previous angle for calculating duration
  servoConfig.previousAngle = servoConfig.currentAngle;

  // Store target angle
  servoConfig.targetAngle = angle;

  // For speed control, calculate movement speed based on speed setting (1-100%)
  // The ESP32Servo library doesn't directly support speed control, but we can
  // log what we would do with speed in a real implementation.
  Serial.printf("Servo %s: Moving to angle %d\n", servoConfig.id.c_str(),
                angle);

  // Move servo to target angle
  servoConfig.servo.write(angle);

  // Update stored position
  servoConfig.currentAngle = angle;

  // Reset timing data
  servoConfig.moveStartTime = 0;
  servoConfig.moveDuration = 0;

  // Mark as pending for action completion tracking
  servoConfig.isActionPending = true;

  return true;
}

// Send error message for when a servo is not found
void sendServoNotFoundError(AsyncWebSocketClient *client, const String &id) {
  StaticJsonDocument<128> response;
  response["status"] = F("ERROR");
  response["message"] = F("Servo not found");
  response["id"] = id;
  response["componentGroup"] = F("servos");

  String jsonResponse;
  serializeJson(response, jsonResponse);
  client->text(jsonResponse);
}

// Update servo action status (for tracking motion completion)
void updateServoActionStatus() {
  for (auto &servo : configuredServos) {
    if (servo.isActionPending) {
      // Get current time
      unsigned long currentTime = millis();

      // Check if this is the first time we're processing this pending action
      if (servo.moveStartTime == 0) {
        // Record the start time and calculate the expected duration
        servo.moveStartTime = currentTime;

        // Calculate move duration based on angle distance and speed setting
        int angleDistance = abs(servo.targetAngle - servo.previousAngle);

        // Default servo speed is 60 degrees in 230ms (full speed)
        // Scale by speed factor (0-100%)
        float speedFactor = servo.speed / 100.0f;
        if (speedFactor <= 0)
          speedFactor = 1.0f;  // Ensure we don't divide by zero

        // Calculate duration - more speed = less time
        servo.moveDuration = (unsigned long)(SERVO_MS_PER_DEGREE_FULL_SPEED *
                                             angleDistance / speedFactor);

        // Ensure a minimum duration for very small movements
        if (servo.moveDuration < 50) servo.moveDuration = 50;

        Serial.printf(
            "Servo %s: Movement from %d to %d (distance %d) expected to take "
            "%lu ms at speed %d%%\n",
            servo.id.c_str(), servo.previousAngle, servo.targetAngle,
            angleDistance, servo.moveDuration, servo.speed);
      }

      // Check if we've waited long enough for the movement to complete
      if (currentTime - servo.moveStartTime >= servo.moveDuration) {
        Serial.printf("Servo %s: Movement complete after %lu ms\n",
                      servo.id.c_str(), currentTime - servo.moveStartTime);

        // Reset timing variables
        servo.moveStartTime = 0;
        servo.moveDuration = 0;
        servo.previousAngle = servo.currentAngle;

        // Mark as completed
        servo.isActionPending = false;

        // If we have a pending command ID, send completion notification
        if (!servo.pendingCommandId.isEmpty()) {
          StaticJsonDocument<256> completionMsg;
          completionMsg["type"] = "actionComplete";
          completionMsg["componentId"] = servo.id;
          completionMsg["componentGroup"] = "servos";
          completionMsg["commandId"] = servo.pendingCommandId;
          completionMsg["success"] = true;
          completionMsg["angle"] = servo.currentAngle;

          String completionJson;
          serializeJson(completionMsg, completionJson);
          ws.textAll(completionJson);

          // Clear the pending command ID
          servo.pendingCommandId = "";
        }
      }
    }
  }
}