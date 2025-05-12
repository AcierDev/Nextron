#include "message_handler.h"

#include <Arduino.h>
#include <ArduinoJson.h>

#include "hardware/io_pin.h"
#include "hardware/servo.h"
#include "hardware/stepper.h"

// FastAccelStepper engine instance (declared in main.cpp.new)
extern FastAccelStepperEngine engine;

void initWebSocketServer() {
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.println(F("WebSocket server started"));
}

void onWebSocketEvent(AsyncWebSocket *server_instance,
                      AsyncWebSocketClient *client, AwsEventType type,
                      void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(),
                    client->remoteIP().toString().c_str());
      break;

    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      break;

    case WS_EVT_DATA: {
      AwsFrameInfo *info = (AwsFrameInfo *)arg;
      if (info->final && info->index == 0 && info->len == len &&
          info->opcode == WS_TEXT) {
        data[len] = 0;  // Null-terminate the received data
        Serial.printf("Received WS [%u]: %s\n", client->id(), (char *)data);

        StaticJsonDocument<512> doc;  // Adjust size as needed
        DeserializationError error = deserializeJson(doc, (char *)data);
        if (error) {
          Serial.printf("JSON DeserializationError: %s\n", error.c_str());
          client->text(F("ERROR: Invalid JSON"));
          return;
        }

        // Debug: Print received message to Serial
        Serial.println(F("Received JSON message:"));
        serializeJsonPretty(doc, Serial);
        Serial.println();

        const char *action = doc["action"];
        const char *group = doc["componentGroup"];

        if (!action) {
          client->text(F("ERROR: Missing action field"));
          return;
        }

        if (!group) {
          client->text(F("ERROR: Missing componentGroup field"));
          return;
        }

        Serial.printf("Processing action: %s for group: %s\n", action, group);

        if (strcmp(group, "pins") == 0) {
          handlePinMessage(client, doc);
        } else if (strcmp(group, "servos") == 0) {
          handleServoMessage(client, doc);
        } else if (strcmp(group, "steppers") == 0) {
          handleStepperMessage(client, doc);
        } else if (strcmp(group, "system") == 0) {
          handleSystemMessage(client, doc);
        } else {
          Serial.printf("Received unhandled group: %s\n", group);
          client->text(F("ERROR: Unhandled component group"));
        }
      }
      break;
    }
    case WS_EVT_PONG:
      Serial.printf("WebSocket PONG received from #%u\n", client->id());
      break;
    case WS_EVT_ERROR:
      Serial.printf("WebSocket client #%u error #%u: %s\n", client->id(),
                    *((uint16_t *)arg), (char *)data);
      break;
  }
}

void handleSystemMessage(AsyncWebSocketClient *client, JsonDocument &doc) {
  const char *action = doc["action"];
  if (strcmp(action, "ping") == 0) {
    StaticJsonDocument<128> response;
    response["status"] = F("OK");
    response["action"] = F("pong");
    response["componentGroup"] = F("system");
    response["timestamp"] = doc["timestamp"];  // Echo timestamp

    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);
  } else {
    client->text(F("ERROR: Unknown system action"));
  }
}

void handlePinMessage(AsyncWebSocketClient *client, JsonDocument &doc) {
  const char *action = doc["action"];

  if (strcmp(action, "configure") == 0) {
    JsonObject config = doc["config"];
    String id = config["id"];
    String name = config["name"];
    uint8_t pin = config["pin"];
    String mode = config["mode"] | "output";
    String pinType = config["pinType"] | "digital";
    PinPullMode pullMode = static_cast<PinPullMode>(config["pullMode"] | 0);
    uint16_t debounceMs = config["debounceMs"] | 0;

    Serial.printf("Configuring pin %s: %s, %d, %s, %s, %d, %d\n", id.c_str(),
                  name.c_str(), pin, mode.c_str(), pinType.c_str(), pullMode,
                  debounceMs);

    if (id.isEmpty() || name.isEmpty()) {
      client->text(F("ERROR: Missing required config fields for pin"));
      return;
    }

    IoPinConfig *existingPin = findPinById(id);
    if (existingPin) {
      cleanupPin(*existingPin);  // Clean up before reconfiguring
      existingPin->name = name;
      existingPin->pin = pin;
      existingPin->mode = mode;
      existingPin->pinType = pinType;
      existingPin->lastValue = -1;  // Reset last value
      existingPin->pullMode = pullMode;
      existingPin->debounceMs = debounceMs;
      initializePin(*existingPin);
    } else {
      IoPinConfig newPin = {id, name,     pin,        pinType, mode,
                            -1, pullMode, debounceMs, nullptr};
      initializePin(newPin);
      configuredPins.push_back(newPin);
    }
    StaticJsonDocument<128> response;
    response["status"] = F("OK");
    response["message"] = F("Pin configured");
    response["id"] = id;
    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);

  } else if (strcmp(action, "readPin") == 0) {
    String id = doc["id"];
    IoPinConfig *pinToRead = findPinById(id);
    if (!pinToRead) {
      client->text(F("ERROR: Pin not found"));
      return;
    }
    if (pinToRead->mode != "input") {
      client->text(F("ERROR: Pin is not configured as input"));
      return;
    }
    int value = 0;
    if (pinToRead->pinType == "digital") {
      value = digitalRead(pinToRead->pin);
    } else if (pinToRead->pinType == "analog") {
      value = analogRead(pinToRead->pin);
    }
    pinToRead->lastValue = value;
    StaticJsonDocument<128> response;
    response["status"] = F("OK");
    response["id"] = pinToRead->id;
    response["value"] = value;
    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);

  } else if (strcmp(action, "writePin") == 0) {
    String id = doc["id"];
    int value = doc["value"];
    String type =
        doc["type"] | "digital";  // Default to digital if not specified

    IoPinConfig *pinToWrite = findPinById(id);
    if (!pinToWrite) {
      client->text(F("ERROR: Pin not found"));
      return;
    }
    if (pinToWrite->mode != "output") {
      client->text(F("ERROR: Pin is not configured as output"));
      return;
    }

    if (type == "digital") {
      digitalWrite(pinToWrite->pin, value ? HIGH : LOW);
    } else if (type == "pwm") {
      ledcWrite(pinToWrite->pin % 16, value);
    } else if (type == "analog") {  // ESP32 DAC
      if (pinToWrite->pin == 25 || pinToWrite->pin == 26) {
        // dacWrite(pinToWrite->pin, constrain(value, 0, 255));
      } else {
        client->text(F("ERROR: Pin does not support analog output (DAC)"));
        return;
      }
    }
    pinToWrite->lastValue = value;
    StaticJsonDocument<128> response;
    response["status"] = F("OK");
    response["message"] = F("Pin value updated");
    response["id"] = pinToWrite->id;
    response["value"] = value;
    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);

  } else if (strcmp(action, "remove") == 0) {
    String id = doc["id"];
    auto it = std::remove_if(configuredPins.begin(), configuredPins.end(),
                             [&](const IoPinConfig &p) { return p.id == id; });
    if (it != configuredPins.end()) {
      cleanupPin(*it);  // Clean up before erasing
      configuredPins.erase(it, configuredPins.end());
      lastPinReadTime.erase(id);  // Remove from polling map
      client->text(F("OK: Pin removed"));
    } else {
      client->text(F("ERROR: Pin not found for removal"));
    }
  } else {
    client->text(F("ERROR: Unknown pin action"));
  }
}

void handleServoMessage(AsyncWebSocketClient *client, JsonDocument &doc) {
  const char *action = doc["action"];
  String id = doc["id"];  // Common for most servo actions

  if (strcmp(action, "configure") == 0) {
    JsonObject config = doc["config"];
    String cfg_id = config["id"];
    String name = config["name"];
    uint8_t pin = config["pin"];
    int minAngle = config["minAngle"] | 0;
    int maxAngle = config["maxAngle"] | 180;
    int minPulseWidth = config["minPulseWidth"] | 500;
    int maxPulseWidth = config["maxPulseWidth"] | 2400;
    int initialAngle = config["initialAngle"] | 90;

    if (cfg_id.isEmpty() || name.isEmpty() || pin == 0) {
      client->text(F("ERROR: Missing servo config fields (id, name, pin)"));
      return;
    }

    ServoConfig *existingServo = findServoById(cfg_id);

    if (existingServo) {
      // Clean up existing servo before reconfiguring
      cleanupServo(*existingServo);

      // Update configuration
      existingServo->name = name;
      existingServo->pin = pin;
      existingServo->minAngle = minAngle;
      existingServo->maxAngle = maxAngle;
      existingServo->minPulseWidth = minPulseWidth;
      existingServo->maxPulseWidth = maxPulseWidth;
      existingServo->currentAngle = initialAngle;

      // Initialize with new configuration
      initializeServo(*existingServo);
    } else {
      ServoConfig newServo;
      newServo.id = cfg_id;
      newServo.name = name;
      newServo.pin = pin;
      newServo.minAngle = minAngle;
      newServo.maxAngle = maxAngle;
      newServo.minPulseWidth = minPulseWidth;
      newServo.maxPulseWidth = maxPulseWidth;
      newServo.currentAngle = initialAngle;
      newServo.isAttached = false;

      // Initialize the servo
      initializeServo(newServo);
      configuredServos.push_back(newServo);
    }

    // Send success response
    StaticJsonDocument<256> response;
    response["status"] = F("OK");
    response["message"] = F("Servo configured");
    response["id"] = cfg_id;
    response["componentGroup"] = F("servos");
    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);

  } else if (strcmp(action, "control") == 0) {
    // New control action for servos (similar to stepper control)
    const char *command = doc["command"];
    if (!command) {
      client->text(F("ERROR: Missing 'command' for servo control"));
      return;
    }

    ServoConfig *servo = findServoById(id);
    if (!servo) {
      sendServoNotFoundError(client, id);
      return;
    }

    if (strcmp(command, "move") == 0) {
      int angle = doc["angle"] | -1;

      if (angle < 0) {
        client->text(F("ERROR: Missing or invalid 'angle' for servo move"));
        return;
      }

      // Process speed if provided
      if (doc.containsKey("speed")) {
        int speed = doc["speed"].as<int>();
        // Ensure speed is in valid range
        if (speed < 1) speed = 1;
        if (speed > 100) speed = 100;
        servo->speed = speed;
      }

      // Store command ID if provided (for sequence tracking)
      if (doc.containsKey("commandId")) {
        servo->pendingCommandId = doc["commandId"].as<String>();
      }

      // Try to move the servo
      if (moveServo(*servo, angle)) {
        char buffer[100];
        snprintf(buffer, sizeof(buffer), "OK: Servo %s moving to angle %d",
                 id.c_str(), angle);
        client->text(buffer);
      } else {
        String errorMsg = String(F("ERROR: Failed to move servo ")) + id +
                          F(" to angle ") + String(angle);
        client->text(errorMsg);
      }
    } else if (strcmp(command, "detach") == 0) {
      cleanupServo(*servo);
      client->text(String(F("OK: Servo ")) + id + F(" detached"));
    } else if (strcmp(command, "setParams") == 0) {
      if (doc.containsKey("minAngle")) {
        servo->minAngle = doc["minAngle"].as<int>();
      }
      if (doc.containsKey("maxAngle")) {
        servo->maxAngle = doc["maxAngle"].as<int>();
      }
      if (doc.containsKey("minPulseWidth")) {
        servo->minPulseWidth = doc["minPulseWidth"].as<int>();
      }
      if (doc.containsKey("maxPulseWidth")) {
        servo->maxPulseWidth = doc["maxPulseWidth"].as<int>();
      }

      client->text(String(F("OK: Servo parameters updated for ")) + id);
    } else {
      client->text(F("ERROR: Unknown servo command"));
    }
  } else if (strcmp(action, "moveServo") == 0) {
    // Legacy action for backward compatibility
    int angle = doc["angle"] | -1;

    if (angle < 0) {
      client->text(F("ERROR: Missing or invalid 'angle' for servo move"));
      return;
    }

    ServoConfig *servo = findServoById(id);
    if (!servo) {
      sendServoNotFoundError(client, id);
      return;
    }

    // Store command ID if provided (for sequence tracking)
    if (doc.containsKey("commandId")) {
      servo->pendingCommandId = doc["commandId"].as<String>();
    }

    // Try to move the servo
    if (moveServo(*servo, angle)) {
      char buffer[100];
      snprintf(buffer, sizeof(buffer), "OK: Servo %s moving to angle %d",
               id.c_str(), angle);
      client->text(buffer);
    } else {
      String errorMsg = String(F("ERROR: Failed to move servo ")) + id +
                        F(" to angle ") + String(angle);
      client->text(errorMsg);
    }

  } else if (strcmp(action, "detachServo") == 0) {
    // Legacy action for backward compatibility
    ServoConfig *servo = findServoById(id);
    if (!servo) {
      sendServoNotFoundError(client, id);
      return;
    }

    cleanupServo(*servo);
    client->text(String(F("OK: Servo ")) + id + F(" detached"));

  } else if (strcmp(action, "remove") == 0) {
    auto it = std::remove_if(configuredServos.begin(), configuredServos.end(),
                             [&](const ServoConfig &s) { return s.id == id; });

    if (it != configuredServos.end()) {
      cleanupServo(*it);  // Clean up before erasing
      configuredServos.erase(it, configuredServos.end());
      client->text(String(F("OK: Servo removed: ")) + id);
    } else {
      client->text(String(F("ERROR: Servo not found for removal: ")) + id);
    }

  } else {
    client->text(F("ERROR: Unknown servo action"));
  }
}

void handleStepperMessage(AsyncWebSocketClient *client, JsonDocument &doc) {
  const char *action = doc["action"];
  String id = doc["id"];  // Common for most stepper actions

  StepperConfig *stepper = findStepperById(id);

  if (strcmp(action, "configure") == 0) {
    JsonObject config = doc["config"];
    String cfg_id = config["id"];
    String name = config["name"];
    uint8_t pulPin = config["pulPin"];
    uint8_t dirPin = config["dirPin"];
    uint8_t enaPin = config["enaPin"] | 0;
    long minPosition = config["minPosition"] | -50000;
    long maxPosition = config["maxPosition"] | 50000;
    float stepsPerInch = config["stepsPerInch"] | 200.0;

    if (cfg_id.isEmpty() || name.isEmpty() || pulPin == 0 || dirPin == 0) {
      client->text(
          F("ERROR: Missing stepper config fields (id, name, pulPin, dirPin)"));
      return;
    }

    StepperConfig *existingStepper = findStepperById(cfg_id);

    if (existingStepper) {
      Serial.printf("Updating stepper ID %s (%s)\n", cfg_id.c_str(),
                    name.c_str());
      existingStepper->name = name;
      existingStepper->minPosition = minPosition;
      existingStepper->maxPosition = maxPosition;
      existingStepper->stepsPerInch = stepsPerInch;
      // Note: Pin configuration for FastAccelStepper is usually set at creation
      // and might not be easily updatable without recreating the stepper
      // instance.
    } else {
      Serial.printf("Adding stepper ID %s (%s) on PUL %d, DIR %d, ENA %d\n",
                    cfg_id.c_str(), name.c_str(), pulPin, dirPin, enaPin);
      StepperConfig newConfig;
      newConfig.id = cfg_id;
      newConfig.name = name;
      newConfig.pulPin = pulPin;
      newConfig.dirPin = dirPin;
      newConfig.enaPin = enaPin;
      newConfig.minPosition = minPosition;
      newConfig.maxPosition = maxPosition;
      newConfig.stepsPerInch = stepsPerInch;

      newConfig.stepper = engine.stepperConnectToPin(pulPin);
      if (newConfig.stepper) {
        newConfig.stepper->setDirectionPin(dirPin);
        if (enaPin > 0) {
          newConfig.stepper->setEnablePin(enaPin);
          newConfig.stepper->setAutoEnable(true);
        } else {
          newConfig.stepper->setAutoEnable(false);
        }
        newConfig.stepper->setSpeedInHz(newConfig.maxSpeed);
        newConfig.stepper->setAcceleration(newConfig.acceleration);
        configuredSteppers.push_back(newConfig);
        existingStepper = &configuredSteppers.back();
      } else {
        client->text(String(F("ERROR: Failed to create stepper on pin ")) +
                     String(pulPin));
        return;
      }
    }
    StaticJsonDocument<256> response;
    response["status"] = F("OK");
    response["message"] = F("Stepper configured");
    response["id"] = existingStepper->id;
    response["minPosition"] = existingStepper->minPosition;
    response["maxPosition"] = existingStepper->maxPosition;
    response["stepsPerInch"] = existingStepper->stepsPerInch;
    response["componentGroup"] = F("steppers");
    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);
    return;  // Exit after configure
  }

  // For other actions, stepper must exist
  if (!stepper || !stepper->stepper) {
    sendStepperNotFoundError(client, id);
    return;
  }

  if (strcmp(action, "control") == 0) {
    const char *command = doc["command"];
    if (!command) {
      client->text(F("ERROR: Missing 'command' for stepper control"));
      return;
    }

    if (strcmp(command, "setParams") == 0) {
      if (doc.containsKey("speed")) {
        stepper->maxSpeed = doc["speed"].as<float>();
        stepper->stepper->setSpeedInHz(stepper->maxSpeed);
      }
      if (doc.containsKey("acceleration")) {
        stepper->acceleration = doc["acceleration"].as<float>();
        stepper->stepper->setAcceleration(stepper->acceleration);
      }
      if (doc.containsKey("minPosition"))
        stepper->minPosition = doc["minPosition"].as<long>();
      if (doc.containsKey("maxPosition"))
        stepper->maxPosition = doc["maxPosition"].as<long>();
      if (doc.containsKey("stepsPerInch"))
        stepper->stepsPerInch = doc["stepsPerInch"].as<float>();

      client->text(String(F("OK: Stepper params updated for ")) + id);
    } else if (strcmp(command, "move") == 0) {
      if (doc.containsKey("value")) {
        long targetPos = clampPosition(stepper, doc["value"].as<long>());

        // Store command ID if provided (for sequence tracking)
        const char *commandId = nullptr;
        if (doc.containsKey("commandId")) {
          commandId = doc["commandId"];
          stepper->pendingCommandId = commandId;
        }

        // Set target and start movement
        stepper->stepper->moveTo(targetPos);
        stepper->targetPosition = targetPos;
        stepper->isActionPending =
            true;  // Mark that we need to notify on completion

        // Generate response
        char buffer[100];
        snprintf(buffer, sizeof(buffer), "OK: Stepper %s moving to %ld",
                 id.c_str(), targetPos);
        client->text(buffer);
      } else {
        client->text(F("ERROR: Missing 'value' for move command"));
      }
    } else if (strcmp(command, "step") == 0) {
      if (doc.containsKey("value")) {
        long steps = doc["value"].as<long>();
        long currentPos = stepper->stepper->getCurrentPosition();
        long newPos = clampPosition(stepper, currentPos + steps);
        steps = newPos - currentPos;  // Recalculate steps based on clamping

        // Store command ID if provided (for sequence tracking)
        const char *commandId = nullptr;
        if (doc.containsKey("commandId")) {
          commandId = doc["commandId"];
          stepper->pendingCommandId = commandId;
        }

        if (steps != 0) {
          stepper->stepper->move(steps);
          stepper->targetPosition = newPos;
          stepper->isActionPending =
              true;  // Mark that we need to notify on completion
        } else {
          // If no actual movement due to clamping, send completion immediately
          if (commandId) {
            StaticJsonDocument<256> completionMsg;
            completionMsg["type"] = "actionComplete";
            completionMsg["componentId"] = id;
            completionMsg["componentGroup"] = "steppers";
            completionMsg["commandId"] = commandId;
            completionMsg["success"] = true;

            String completionJson;
            serializeJson(completionMsg, completionJson);
            ws.textAll(completionJson);
          }
        }

        // Generate response
        char buffer[128];
        snprintf(buffer, sizeof(buffer), "OK: Stepper %s stepping %ld to %ld",
                 id.c_str(), steps, newPos);
        client->text(buffer);
      } else {
        client->text(F("ERROR: Missing 'value' for step command"));
      }
    } else if (strcmp(command, "home") == 0) {
      long homePos = (stepper->minPosition + stepper->maxPosition) / 2;
      stepper->stepper->moveTo(homePos);
      stepper->targetPosition = homePos;
      char buffer[100];
      snprintf(buffer, sizeof(buffer), "OK: Stepper %s homing to %ld",
               id.c_str(), homePos);
      client->text(buffer);
    } else if (strcmp(command, "stop") == 0) {
      stepper->stepper->forceStop();
      client->text(String(F("OK: Stepper ")) + id + F(" emergency stop"));
    } else if (strcmp(command, "setCurrentPosition") == 0) {
      if (doc.containsKey("value")) {
        long newPosition = doc["value"].as<long>();
        stepper->stepper->setCurrentPosition(newPosition);
        // Also update our tracked positions to match the new logical position
        stepper->currentPosition = newPosition;
        stepper->targetPosition = newPosition;
        stepper->isActionPending =
            false;  // Ensure any pending action is cleared
        stepper->pendingCommandId = "";

        // Send confirmation response
        char buffer[128];
        snprintf(buffer, sizeof(buffer),
                 "OK: Stepper %s current position set to %ld", id.c_str(),
                 newPosition);
        client->text(buffer);
        Serial.printf("%s\n", buffer);

        // Send an immediate position update to UI
        StaticJsonDocument<128> updateDoc;
        updateDoc["id"] = stepper->id;
        updateDoc["position"] = newPosition;
        updateDoc["componentGroup"] = F("steppers");
        String output;
        serializeJson(updateDoc, output);
        ws.textAll(output);

      } else {
        client->text(
            F("ERROR: Missing 'value' for setCurrentPosition command"));
      }
    } else {
      client->text(F("ERROR: Unknown stepper command"));
    }
  } else if (strcmp(action, "remove") == 0) {
    auto it =
        std::remove_if(configuredSteppers.begin(), configuredSteppers.end(),
                       [&](const StepperConfig &s) { return s.id == id; });
    if (it != configuredSteppers.end()) {
      if (it->stepper) {
        it->stepper->forceStop();
        // engine.deleteStepper(it->stepper); // FastAccelStepper handles its
        // own stepper objects
      }
      configuredSteppers.erase(it, configuredSteppers.end());
      client->text(String(F("OK: Stepper removed: ")) + id);
    } else {
      client->text(String(F("ERROR: Stepper not found for removal: ")) + id);
    }
  } else {
    client->text(F("ERROR: Unknown stepper action"));
  }
}