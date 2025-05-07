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
  static unsigned long lastReportTime = 0;  // For throttling position updates

  for (auto &servoConfig : configuredServos) {
    if (!servoConfig.isAttached || !servoConfig.isMoving) {
      continue;  // Skip if not attached or not supposed to be moving
    }

    // Ensure targetPulseWidth is valid based on targetAngle
    // This handles cases where targetAngle might be set but targetPulseWidth
    // wasn't updated
    int calculatedTargetPulseWidth =
        angleToPulseWidth(servoConfig, servoConfig.targetAngle);
    if (servoConfig.targetPulseWidth != calculatedTargetPulseWidth) {
      servoConfig.targetPulseWidth = calculatedTargetPulseWidth;
    }

    if (servoConfig.currentPulseWidth == servoConfig.targetPulseWidth) {
      servoConfig.isMoving = false;  // Reached target

      // Send a final completion update (only if it was moving)
      // This prevents spamming "COMPLETE" if it was already at target.
      StaticJsonDocument<128> updateDoc;
      updateDoc["id"] = servoConfig.id;
      updateDoc["angle"] = servoConfig.currentAngle;
      updateDoc["status"] = "COMPLETE";
      updateDoc["componentGroup"] = "servos";
      String output;
      serializeJson(updateDoc, output);
      ws.textAll(output);  // Consider sending only to the client that initiated
                           // if possible
      continue;
    }

    // Calculate delay based on speed: higher speed = shorter delay
    // This delay determines how often we update the pulse width
    int delayBetweenSteps = map(servoConfig.speed, 1, 100, 20,
                                2);  // e.g., 20ms (slow) to 2ms (fast)
    if (currentTime - servoConfig.lastMoveTime <
        (unsigned long)delayBetweenSteps) {
      continue;
    }

    // Calculate pulse width change amount for this step
    // Higher speed = larger change in pulse width per step
    int pulseWidthChangePerCycle = map(servoConfig.speed, 1, 100, 1,
                                       25);  // e.g., 1µs (slow) to 25µs (fast)

    int direction =
        (servoConfig.targetPulseWidth > servoConfig.currentPulseWidth) ? 1 : -1;
    int remainingPulseWidth =
        abs(servoConfig.targetPulseWidth - servoConfig.currentPulseWidth);
    int actualChange = min(pulseWidthChangePerCycle, remainingPulseWidth);

    if (actualChange > 0) {
      int newPulseWidth =
          servoConfig.currentPulseWidth + (direction * actualChange);
      setServoPulseWidth(
          servoConfig,
          newPulseWidth);  // This updates currentPulseWidth and currentAngle
      servoConfig.lastMoveTime = currentTime;

      // Throttle position updates to avoid flooding WebSocket
      if (currentTime - lastReportTime >
          100) {  // e.g., update every 100ms (10Hz)
        lastReportTime = currentTime;
        StaticJsonDocument<128> updateDoc;
        updateDoc["id"] = servoConfig.id;
        updateDoc["angle"] =
            servoConfig.currentAngle;  // Report the latest angle
        updateDoc["componentGroup"] = "servos";
        String output;
        serializeJson(updateDoc, output);
        ws.textAll(output);
      }
    } else {  // Should not happen if remainingPulseWidth > 0, but as a fallback
      servoConfig.isMoving = false;
    }
  }
}