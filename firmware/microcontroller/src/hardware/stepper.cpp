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
  response["status"] = "ERROR";
  response["message"] = "Stepper not found or not initialized";
  response["id"] = id;
  response["componentGroup"] = "steppers";

  String jsonResponse;
  serializeJson(response, jsonResponse);
  client->text(jsonResponse);
}

// Update and report stepper positions
void updateStepperPositions() {
  unsigned long now = millis();

  for (auto &stepperConfig : configuredSteppers) {
    if (stepperConfig.stepper) {
      // Check and report position periodically
      if (now - stepperConfig.lastPositionReportTime >=
          stepperPositionReportInterval) {
        long currentPos = stepperConfig.stepper->getCurrentPosition();
        if (currentPos != stepperConfig.currentPosition) {
          stepperConfig.currentPosition = currentPos;
          stepperConfig.lastPositionReportTime = now;

          StaticJsonDocument<128> updateDoc;
          updateDoc["id"] = stepperConfig.id;
          updateDoc["position"] = currentPos;
          updateDoc["componentGroup"] = "steppers";

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