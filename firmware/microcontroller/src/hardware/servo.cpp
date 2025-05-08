#include "servo.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncWebSocket.h>

// Forward declaration for WebSocket instance
extern AsyncWebSocket ws;

// Convert angle (degrees) to pulse width (microseconds)
int angleToPulseWidth(const ServoConfig &config, int angle) {
  angle = constrain(angle, config.minAngle, config.maxAngle);
  return map(angle, config.minAngle, config.maxAngle, config.minPulseWidth,
             config.maxPulseWidth);
}

// Convert pulse width (microseconds) to angle (degrees)
int pulseWidthToAngle(const ServoConfig &config, int pulseWidth) {
  pulseWidth =
      constrain(pulseWidth, config.minPulseWidth, config.maxPulseWidth);
  return map(pulseWidth, config.minPulseWidth, config.maxPulseWidth,
             config.minAngle, config.maxAngle);
}

// Attach a servo using ESP32 LEDC peripheral
void attachServoPWM(ServoConfig &servoConfig) {
  if (servoConfig.isAttached) return;

  // Find an available LEDC channel (simple strategy: use pin number modulo 16
  // for uniqueness) ESP32 has 16 channels (0-15)
  servoConfig.channel = servoConfig.pin % 16;
  // A more robust system might check for channel availability if many servos
  // are used.

  // Configure LEDC for servo control (50Hz frequency, 16-bit resolution)
  // 50Hz = 20ms period. 16-bit resolution gives 65536 steps.
  // Standard servo pulse widths are typically 500µs to 2500µs.
  ledcSetup(servoConfig.channel, 50, 16);
  ledcAttachPin(servoConfig.pin, servoConfig.channel);

  // Set initial position (currentAngle or a default if not set)
  int initialPulseWidth =
      angleToPulseWidth(servoConfig, servoConfig.currentAngle);
  if (servoConfig.currentPulseWidth == -1) {  // If not already set
    servoConfig.currentPulseWidth = initialPulseWidth;
  }
  servoConfig.targetPulseWidth = servoConfig.currentPulseWidth;

  // Convert microseconds to LEDC duty cycle value
  // Duty cycle = (pulseWidth_us / 20000_us_period) * 65536_resolution
  uint32_t duty = (uint32_t)((servoConfig.currentPulseWidth / 20000.0) * 65535);
  ledcWrite(servoConfig.channel, duty);

  servoConfig.isAttached = true;
  Serial.printf(
      "Servo %s (Pin %d, Ch %d) attached. Initial PW: %dµs, Angle: %d\n",
      servoConfig.id.c_str(), servoConfig.pin, servoConfig.channel,
      servoConfig.currentPulseWidth, servoConfig.currentAngle);
}

// Detach a servo from LEDC
void detachServoPWM(ServoConfig &servoConfig) {
  if (!servoConfig.isAttached) return;
  ledcDetachPin(servoConfig.pin);
  servoConfig.isAttached = false;
  servoConfig.isMoving = false;  // Stop any movement
  Serial.printf("Servo %s (Pin %d, Ch %d) detached.\n", servoConfig.id.c_str(),
                servoConfig.pin, servoConfig.channel);
}

// Set servo position by writing pulse width with microsecond precision
void setServoPulseWidth(ServoConfig &servoConfig, int pulseWidth_us) {
  if (!servoConfig.isAttached) {
    attachServoPWM(servoConfig);  // Ensure attached
  }

  pulseWidth_us = constrain(pulseWidth_us, servoConfig.minPulseWidth,
                            servoConfig.maxPulseWidth);

  uint32_t duty = (uint32_t)((pulseWidth_us / 20000.0) * 65535);
  ledcWrite(servoConfig.channel, duty);

  // Update servoConfig's internal state
  servoConfig.currentPulseWidth = pulseWidth_us;
  servoConfig.currentAngle = pulseWidthToAngle(servoConfig, pulseWidth_us);
}

// Update servo movements based on speed and target positions
void updateServoMovements() {
  unsigned long currentTime = millis();
  static unsigned long lastReportTime = 0;

  for (auto &servoConfig : configuredServos) {
    // If it's a timed sequence action that is pending
    if (servoConfig.isActionPending && servoConfig.calculatedMoveDuration > 0) {
      if (currentTime - servoConfig.movementStartTime >=
          servoConfig.calculatedMoveDuration) {
        // Time is up for this sequenced move
        Serial.printf(
            "Servo %s: Timed move for cmd %s complete. Duration: %lu ms. "
            "Forcing to target %d.\n",
            servoConfig.id.c_str(), servoConfig.pendingCommandId.c_str(),
            servoConfig.calculatedMoveDuration, servoConfig.targetAngle);

        // Force state to target
        servoConfig.currentAngle = servoConfig.targetAngle;
        servoConfig.currentPulseWidth =
            angleToPulseWidth(servoConfig, servoConfig.targetAngle);
        setServoPulseWidth(
            servoConfig,
            servoConfig.currentPulseWidth);  // Final electrical command

        servoConfig.isMoving = false;
        servoConfig.isActionPending = false;

        // Send actionComplete message
        StaticJsonDocument<256> completionMsg;
        completionMsg["type"] = "actionComplete";
        completionMsg["componentId"] = servoConfig.id;
        completionMsg["componentGroup"] = "servos";
        completionMsg["commandId"] = servoConfig.pendingCommandId;
        completionMsg["success"] = true;
        completionMsg["angle"] = servoConfig.currentAngle;
        String completionJson;
        serializeJson(completionMsg, completionJson);
        ws.textAll(completionJson);

        servoConfig.pendingCommandId = "";
        servoConfig.calculatedMoveDuration = 0;  // Clear duration

        // Send a general status update
        StaticJsonDocument<128> updateDoc;
        updateDoc["id"] = servoConfig.id;
        updateDoc["angle"] = servoConfig.currentAngle;
        updateDoc["status"] = "IDLE";
        updateDoc["componentGroup"] = "servos";
        String output;
        serializeJson(updateDoc, output);
        ws.textAll(output);
        continue;  // Move to next servo
      }
      // If time is not up, isMoving should be true (set by message_handler) to
      // allow PWM stepping
    }

    // Standard PWM stepping logic (applies to manual moves, and to sequence
    // moves during their calculatedDuration)
    if (!servoConfig.isAttached || !servoConfig.isMoving) {
      continue;
    }

    // This check is important for manual moves, or if a sequence move finishes
    // by reaching pulse target before time (unlikely with current logic)
    if (servoConfig.currentPulseWidth == servoConfig.targetPulseWidth &&
        !servoConfig.isActionPending) {
      servoConfig.isMoving = false;
      // For manual moves that reach target, send a general status update
      StaticJsonDocument<128> updateDoc;
      updateDoc["id"] = servoConfig.id;
      updateDoc["angle"] = servoConfig.currentAngle;
      updateDoc["status"] = "IDLE";
      updateDoc["componentGroup"] = "servos";
      String output;
      serializeJson(updateDoc, output);
      ws.textAll(output);
      continue;
    }

    // Calculate delay based on servoConfig.speed (which is 100 for sequences)
    int delayBetweenSteps =
        map(servoConfig.speed, 1, 100, 20, 2);  // 2ms for speed 100
    if (currentTime - servoConfig.lastMoveTime <
        (unsigned long)delayBetweenSteps) {
      continue;
    }

    int pulseWidthChangePerCycle =
        map(servoConfig.speed, 1, 100, 1, 25);  // 25us for speed 100
    int direction =
        (servoConfig.targetPulseWidth > servoConfig.currentPulseWidth) ? 1 : -1;
    int remainingPulseWidth =
        abs(servoConfig.targetPulseWidth - servoConfig.currentPulseWidth);
    int actualChange = min(pulseWidthChangePerCycle, remainingPulseWidth);

    if (actualChange > 0) {
      int newPulseWidth =
          servoConfig.currentPulseWidth + (direction * actualChange);
      setServoPulseWidth(servoConfig, newPulseWidth);
      servoConfig.lastMoveTime = currentTime;

      if (currentTime - lastReportTime > 100) {
        lastReportTime = currentTime;
        StaticJsonDocument<128> updateDoc;
        updateDoc["id"] = servoConfig.id;
        updateDoc["angle"] = servoConfig.currentAngle;
        updateDoc["componentGroup"] = "servos";
        String output;
        serializeJson(updateDoc, output);
        ws.textAll(output);
      }
    } else if (!servoConfig.isActionPending) {  // If not a timed action and no
                                                // change, stop moving
      servoConfig.isMoving = false;
    }
  }
}