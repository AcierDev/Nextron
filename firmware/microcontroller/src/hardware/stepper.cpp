#include "stepper.h"

#include <Arduino.h>
#include <ArduinoJson.h>

#include "../config.h"  // For StepperConfig, IoPinConfig and findPinById
#include "io_pin.h"     // For IoPinConfig and findPinById

// Forward declaration for WebSocket instance
extern AsyncWebSocket ws;

// --- Stepper Motor Operations ---

// Initialize a stepper motor with the given configuration
bool initializeStepper(StepperConfig& config) {
  // Check if already initialized
  if (config.stepper != nullptr) {
    cleanupStepper(config);  // Clean up existing instance
  }

  // Get the global FastAccelStepperEngine instance
  extern FastAccelStepperEngine engine;

  // Create the stepper instance
  config.stepper = engine.stepperConnectToPin(config.pulPin);
  if (config.stepper == nullptr) {
    Serial.printf("ERROR: Failed to create stepper on pin %d\n", config.pulPin);
    return false;
  }

  // Configure the stepper
  config.stepper->setDirectionPin(config.dirPin);
  if (config.enaPin > 0) {
    config.stepper->setEnablePin(config.enaPin);
    config.stepper->setAutoEnable(true);
  } else {
    config.stepper->setAutoEnable(false);
  }

  // Set speed and acceleration
  config.stepper->setSpeedInHz(config.maxSpeed);
  config.stepper->setAcceleration(config.acceleration);

  // Initialize other properties
  config.currentPosition = config.stepper->getCurrentPosition();
  config.targetPosition = config.currentPosition;
  config.isActionPending = false;
  config.isHoming = false;
  config.pendingCommandId = "";

  // Serial.printf("Stepper '%s' initialized:\n", config.name.c_str());
  // Serial.printf("  - Pins: PUL=%d, DIR=%d, ENA=%d\n", config.pulPin,
  //               config.dirPin, config.enaPin);
  // Serial.printf("  - Speed: %.2f steps/sec\n", config.maxSpeed);
  // Serial.printf("  - Acceleration: %.2f steps/sec²\n", config.acceleration);
  // Serial.printf("  - Position Range: %ld to %ld steps\n", config.minPosition,
  //               config.maxPosition);
  // Serial.printf("  - Steps per inch: %.2f\n", config.stepsPerInch);

  return true;
}

// Clean up a stepper motor (stop, disable, etc.)
void cleanupStepper(StepperConfig& config) {
  if (config.stepper != nullptr) {
    config.stepper->forceStop();
    if (config.enaPin > 0) {
      config.stepper->disableOutputs();
    }
  }
}

// Move stepper to absolute position (with limits)
bool moveStepperToPosition(StepperConfig& config, long position) {
  if (config.stepper == nullptr) return false;

  // Clamp to limits
  long targetPos = clampPosition(&config, position);

  // Start the move
  config.stepper->moveTo(targetPos);
  config.targetPosition = targetPos;
  config.isActionPending = true;

  Serial.printf("Stepper '%s' moving to position %ld\n", config.name.c_str(),
                targetPos);
  return true;
}

// Move stepper by relative steps (with limits)
bool moveStepperRelative(StepperConfig& config, long steps) {
  if (config.stepper == nullptr) return false;

  long currentPos = config.stepper->getCurrentPosition();
  long newPos = clampPosition(&config, currentPos + steps);
  long adjustedSteps =
      newPos - currentPos;  // Recalculate steps based on clamping

  if (adjustedSteps == 0) {
    // No movement needed (already at limit)
    return false;
  }

  // Start the move
  config.stepper->move(adjustedSteps);
  config.targetPosition = newPos;
  config.isActionPending = true;

  Serial.printf("Stepper '%s' moving relative by %ld steps to %ld\n",
                config.name.c_str(), adjustedSteps, newPos);
  return true;
}

// Stop stepper motor immediately
void stopStepper(StepperConfig& config) {
  if (config.stepper == nullptr) return;

  config.stepper->forceStop();
  config.isActionPending = false;
  config.isHoming = false;
  config.targetPosition = config.stepper->getCurrentPosition();

  Serial.printf("Stepper '%s' emergency stop\n", config.name.c_str());
}

// Set current position (logical position)
bool setStepperCurrentPosition(StepperConfig& config, long position) {
  if (config.stepper == nullptr) return false;

  config.stepper->setCurrentPosition(position);
  config.currentPosition = position;
  config.targetPosition = position;
  config.isActionPending = false;

  Serial.printf("Stepper '%s' current position set to %ld\n",
                config.name.c_str(), position);
  return true;
}

// Start homing sequence for stepper with sensor
bool homeStepperWithSensor(StepperConfig& config) {
  if (config.stepper == nullptr) return false;

  // Check if we have a valid home sensor ID
  if (config.homeSensorId.isEmpty()) {
    Serial.printf("Stepper '%s' has no home sensor configured\n",
                  config.name.c_str());
    return false;
  }

  // Check if the sensor exists and is configured as an input
  IoPinConfig* sensorPin = findPinById(config.homeSensorId);
  if (!sensorPin || sensorPin->mode != "input") {
    Serial.printf("Stepper '%s' home sensor '%s' not found or not an input\n",
                  config.name.c_str(), config.homeSensorId.c_str());
    return false;
  }

  // Set homing speed (usually slower than normal operation)
  float originalSpeed = config.maxSpeed;
  float originalAccel = config.acceleration;

  // Use homing speed if configured, otherwise use 50% of normal speed
  float homingSpeed =
      (config.homingSpeed > 0) ? config.homingSpeed : (config.maxSpeed * 0.5);

  config.stepper->setSpeedInHz(homingSpeed);
  config.stepper->setAcceleration(originalAccel);  // Keep same acceleration

  // Start moving in the homing direction (towards the sensor)
  // We'll use a large value to ensure we don't stop before hitting the sensor
  long moveDistance =
      config.homingDirection * 1000000;  // 1 million steps in homing direction
  long targetPos = config.stepper->getCurrentPosition() + moveDistance;

  config.stepper->moveTo(targetPos);
  config.isHoming = true;
  config.isActionPending = true;

  Serial.printf("Stepper '%s' homing in direction %d at speed %.2f steps/sec\n",
                config.name.c_str(), config.homingDirection, homingSpeed);
  return true;
}

// Helper to clamp a position within the stepper's limits
long clampPosition(StepperConfig* stepper, long position) {
  if (position < stepper->minPosition) return stepper->minPosition;
  if (position > stepper->maxPosition) return stepper->maxPosition;
  return position;
}

// --- WebSocket Communication ---

// Send JSON error message for when a stepper is not found
void sendStepperNotFoundError(AsyncWebSocketClient* client, const String& id) {
  StaticJsonDocument<128> response;
  response["status"] = F("ERROR");
  response["message"] = F("Stepper not found or not initialized");
  response["id"] = id;
  response["componentGroup"] = F("steppers");

  String jsonResponse;
  serializeJson(response, jsonResponse);
  client->text(jsonResponse);
}

// Send position update for a stepper
void sendStepperPositionUpdate(const StepperConfig& config) {
  StaticJsonDocument<128> updateDoc;
  updateDoc["id"] = config.id;
  updateDoc["position"] = config.currentPosition;
  updateDoc["componentGroup"] = F("steppers");

  String output;
  serializeJson(updateDoc, output);
  ws.textAll(output);
}

// Send action completion notification
void sendStepperActionComplete(const StepperConfig& config, bool success,
                               const String& errorMsg) {
  if (config.pendingCommandId.isEmpty())
    return;  // No pending command to complete

  StaticJsonDocument<256> completionMsg;
  completionMsg["type"] = "actionComplete";
  completionMsg["componentId"] = config.id;
  completionMsg["componentGroup"] = "steppers";
  completionMsg["commandId"] = config.pendingCommandId;
  completionMsg["success"] = success;
  completionMsg["position"] = config.currentPosition;

  if (!success && !errorMsg.isEmpty()) {
    completionMsg["error"] = errorMsg;
  }

  String completionJson;
  serializeJson(completionMsg, completionJson);
  ws.textAll(completionJson);

  Serial.printf("Stepper '%s': Action %s for command %s at position %ld\n",
                config.id.c_str(), success ? "completed" : "failed",
                config.pendingCommandId.c_str(), config.currentPosition);
}

// --- Periodic Updates ---

// Update and report stepper positions
void updateStepperPositions() {
  unsigned long now = millis();

  for (auto& stepperConfig : configuredSteppers) {
    if (stepperConfig.stepper) {
      // Get current position
      long currentPos = stepperConfig.stepper->getCurrentPosition();

      // Handle homing sequence
      if (stepperConfig.isHoming) {
        IoPinConfig* sensorPin = findPinById(stepperConfig.homeSensorId);
        if (sensorPin && sensorPin->mode == "input") {
          int sensorValue =
              digitalRead(sensorPin->pin);  // Direct read for responsiveness

          // Check if sensor is triggered (matches the active state)
          if (sensorValue == stepperConfig.homeSensorPinActiveState) {
            Serial.printf(
                "Stepper '%s': Home sensor '%s' triggered! Setting home "
                "position.\n",
                stepperConfig.id.c_str(), stepperConfig.homeSensorId.c_str());

            // Stop the motor and set position to the configured home offset
            stepperConfig.stepper->forceStopAndNewPosition(
                stepperConfig.homePositionOffset);
            stepperConfig.currentPosition = stepperConfig.homePositionOffset;
            stepperConfig.targetPosition = stepperConfig.homePositionOffset;
            stepperConfig.isHoming = false;
            stepperConfig.isActionPending = false;
            stepperConfig.isHomed = true;

            // Restore normal operational speed and acceleration
            stepperConfig.stepper->setSpeedInHz(stepperConfig.maxSpeed);
            stepperConfig.stepper->setAcceleration(stepperConfig.acceleration);

            // Send completion notification
            sendStepperActionComplete(stepperConfig, true);
            stepperConfig.pendingCommandId = "";

            // Send position update immediately
            sendStepperPositionUpdate(stepperConfig);
          }
        } else {
          // Sensor not found or not input: Abort homing
          Serial.printf(
              "Stepper '%s': Home sensor '%s' not found or not an input. "
              "Aborting homing.\n",
              stepperConfig.id.c_str(), stepperConfig.homeSensorId.c_str());

          stopStepper(stepperConfig);
          sendStepperActionComplete(stepperConfig, false, "Home sensor error");
          stepperConfig.pendingCommandId = "";
        }
      }
      // Handle normal move completion
      else if (stepperConfig.isActionPending) {
        // Check if stepper has stopped moving
        if (!stepperConfig.stepper->isRunning()) {
          stepperConfig.isActionPending = false;
          stepperConfig.currentPosition = currentPos;

          // Send completion notification if we have a command ID
          if (!stepperConfig.pendingCommandId.isEmpty()) {
            sendStepperActionComplete(stepperConfig, true);
            stepperConfig.pendingCommandId = "";
          }
        }
      }

      // Check and report position periodically
      if (now - stepperConfig.lastPositionReportTime >=
          stepperPositionReportInterval) {
        if (currentPos != stepperConfig.currentPosition) {
          stepperConfig.currentPosition = currentPos;
          stepperConfig.lastPositionReportTime = now;
          sendStepperPositionUpdate(stepperConfig);
        }
      }
    }
  }
}