#include "stepper.h"

#include <Arduino.h>
#include <ArduinoJson.h>

// Forward declaration for WebSocket instance
extern AsyncWebSocket ws;

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

      // Check if a movement has completed
      if (stepperConfig.isActionPending) {
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