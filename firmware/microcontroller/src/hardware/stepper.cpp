#include "stepper.h"

#include <Arduino.h>
#include <ArduinoJson.h>

#include "../config.h"  // For StepperConfig, IoPinConfig and findPinById
#include "io_pin.h"  // For IoPinConfig and findPinById, ensure it's included if findPinById is there

// Forward declaration for WebSocket instance
extern AsyncWebSocket ws;
// Forward declaration for configuredPins if findPinById is not in io_pin.h
// directly Or ensure config.h includes what's needed for findPinById to be
// resolved. extern std::vector<IoPinConfig> configuredPins;

// Helper to clamp a position within the stepper's limits
long clampPosition(StepperConfig *stepper, long position) {
  if (position < stepper->minPosition) return stepper->minPosition;
  if (position > stepper->maxPosition) return stepper->maxPosition;
  return position;
}

// Send JSON error message for when a stepper is not found
void sendStepperNotFoundError(AsyncWebSocketClient *client, const String &id) {
  StaticJsonDocument<128> response;
  response["status"] = F("ERROR");
  response["message"] = F("Stepper not found or not initialized");
  response["id"] = id;
  response["componentGroup"] = F("steppers");

  String jsonResponse;
  serializeJson(response, jsonResponse);
  client->text(jsonResponse);
}

// Update and report stepper positions
void updateStepperPositions() {
  unsigned long now = millis();

  for (auto &stepperConfig : configuredSteppers) {
    if (stepperConfig.stepper) {
      // Get current position
      long currentPos = stepperConfig.stepper->getCurrentPosition();

      if (stepperConfig.isHoming) {
        IoPinConfig *sensorPin = findPinById(stepperConfig.homeSensorId);
        if (sensorPin && sensorPin->mode == "input") {
          int sensorValue =
              digitalRead(sensorPin->pin);  // Direct read for responsiveness
          // If using debouncer:
          // sensorPin->debouncer->update();
          // sensorValue = sensorPin->debouncer->read();

          if (sensorValue == stepperConfig.homeSensorPinActiveState) {
            Serial.printf(
                "Stepper %s: Home sensor %s triggered at %d! Active state: "
                "%d\n",
                stepperConfig.id.c_str(), stepperConfig.homeSensorId.c_str(),
                sensorValue, stepperConfig.homeSensorPinActiveState);

            stepperConfig.stepper->forceStopAndNewPosition(
                stepperConfig.homePositionOffset);
            stepperConfig.currentPosition = stepperConfig.homePositionOffset;
            stepperConfig.targetPosition = stepperConfig.homePositionOffset;
            stepperConfig.isHoming = false;
            stepperConfig.isActionPending =
                false;  // Homing is a special action completion

            // Restore normal operational speed and acceleration
            stepperConfig.stepper->setSpeedInHz(stepperConfig.maxSpeed);
            stepperConfig.stepper->setAcceleration(stepperConfig.acceleration);

            // Send actionComplete for the homing command
            if (!stepperConfig.pendingCommandId.isEmpty()) {
              StaticJsonDocument<256> completionMsg;
              completionMsg["type"] = "actionComplete";
              completionMsg["componentId"] = stepperConfig.id;
              completionMsg["componentGroup"] = "steppers";
              completionMsg["commandId"] = stepperConfig.pendingCommandId;
              completionMsg["success"] = true;
              completionMsg["position"] = stepperConfig.currentPosition;

              String completionJson;
              serializeJson(completionMsg, completionJson);
              ws.textAll(completionJson);
              Serial.printf(
                  "Stepper %s: Homing action completed for command %s. "
                  "Position set to %ld\n",
                  stepperConfig.id.c_str(),
                  stepperConfig.pendingCommandId.c_str(),
                  stepperConfig.currentPosition);
              stepperConfig.pendingCommandId = "";  // Clear pending command
            }
            // Send a position update immediately after homing success
            StaticJsonDocument<128> updateDoc;
            updateDoc["id"] = stepperConfig.id;
            updateDoc["position"] = stepperConfig.currentPosition;
            updateDoc["componentGroup"] = F("steppers");
            String output;
            serializeJson(updateDoc, output);
            ws.textAll(output);
          }
        } else {
          // Sensor not found or not input: Abort homing
          if (stepperConfig.isHoming) {  // Check again to ensure this block is
                                         // for active homing
            Serial.printf(
                "Stepper %s: Home sensor ID %s not found or not an input. "
                "Aborting homing.\n",
                stepperConfig.id.c_str(), stepperConfig.homeSensorId.c_str());
            stepperConfig.stepper->forceStop();
            stepperConfig.isHoming = false;
            stepperConfig.isActionPending = false;
            // Restore normal speed/accel
            stepperConfig.stepper->setSpeedInHz(stepperConfig.maxSpeed);
            stepperConfig.stepper->setAcceleration(stepperConfig.acceleration);
            if (!stepperConfig.pendingCommandId.isEmpty()) {
              // Send failure actionComplete
              StaticJsonDocument<256> completionMsg;
              completionMsg["type"] = "actionComplete";
              completionMsg["componentId"] = stepperConfig.id;
              completionMsg["componentGroup"] = "steppers";
              completionMsg["commandId"] = stepperConfig.pendingCommandId;
              completionMsg["success"] = false;
              completionMsg["error"] = "Home sensor error";
              String completionJson;
              serializeJson(completionMsg, completionJson);
              ws.textAll(completionJson);
              stepperConfig.pendingCommandId = "";
            }
          }
        }
      } else if (stepperConfig.isActionPending) {  // Regular move completion
                                                   // (not homing)
        // Check if stepper has stopped moving and is at or near target position
        bool hasArrived = !stepperConfig.stepper->isRunning();

        // If stepper has finished moving
        if (hasArrived) {
          stepperConfig.isActionPending = false;

          // Send completion notification if we have a command ID
          if (!stepperConfig.pendingCommandId.isEmpty()) {
            StaticJsonDocument<256> completionMsg;
            completionMsg["type"] = "actionComplete";
            completionMsg["componentId"] = stepperConfig.id;
            completionMsg["componentGroup"] = "steppers";
            completionMsg["commandId"] = stepperConfig.pendingCommandId;
            completionMsg["success"] = true;
            completionMsg["position"] = currentPos;

            String completionJson;
            serializeJson(completionMsg, completionJson);
            ws.textAll(completionJson);

            Serial.printf(
                "Stepper %s: Action completed for command %s at position %ld\n",
                stepperConfig.id.c_str(),
                stepperConfig.pendingCommandId.c_str(), currentPos);

            // Clear the pending command ID
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

          StaticJsonDocument<128> updateDoc;
          updateDoc["id"] = stepperConfig.id;
          updateDoc["position"] = currentPos;
          updateDoc["componentGroup"] = F("steppers");

          String output;
          serializeJson(updateDoc, output);
          ws.textAll(output);

          Serial.printf(
              "Stepper %s: Position update sent: %ld steps (%.2f inches)\n",
              stepperConfig.id.c_str(), currentPos,
              currentPos / stepperConfig.stepsPerInch);
        }
      }
    }
  }
}