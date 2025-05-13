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
        // Serial.printf("Received WS [%u]: %s\n", client->id(), (char *)data);

        StaticJsonDocument<512> doc;  // Adjust size as needed
        DeserializationError error = deserializeJson(doc, (char *)data);
        if (error) {
          Serial.printf("JSON DeserializationError: %s\n", error.c_str());
          client->text(F("ERROR: Invalid JSON"));
          return;
        }

        if (doc.containsKey("action")) {
          const char *action = doc["action"];
          if (!strcmp(action, "ping") == 0) {
            // Debug: Print received message to Serial
            Serial.println(F("Received JSON message:"));
            serializeJsonPretty(doc, Serial);
            Serial.println();
          }
        }

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

        // Serial.printf("Processing action: %s for group: %s\n", action,
        // group);

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

// handleServoMessage is now implemented in hardware/servo.cpp

void handleStepperMessage(AsyncWebSocketClient *client, JsonDocument &doc) {
  const char *action = doc["action"];
  String id = doc["id"];  // Common for most stepper actions

  // Handle configuration action separately since it might create a new stepper
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
    float maxSpeed = config["maxSpeed"] |
                     50000.0;  // Default to 50k steps/sec if not specified
    float acceleration = config["acceleration"] |
                         50000.0;  // Default to 50k steps/sec² if not specified

    // Optional homing parameters
    String homeSensorId = config["homeSensorId"] | "";
    int homingDirection = config["homingDirection"] | 1;
    float homingSpeed = config["homingSpeed"] | 500.0;
    int homeSensorPinActiveState = config["homeSensorPinActiveState"] | 0;
    long homePositionOffset = config["homePositionOffset"] | 0;

    if (cfg_id.isEmpty() || name.isEmpty() || pulPin == 0 || dirPin == 0) {
      client->text(
          F("ERROR: Missing stepper config fields (id, name, pulPin, dirPin)"));
      return;
    }

    // Serial.printf("Configuring stepper '%s' (ID: %s):\n", name.c_str(),
    //               cfg_id.c_str());
    // Serial.printf("  - Pins: PUL=%d, DIR=%d, ENA=%d\n", pulPin, dirPin,
    // enaPin); Serial.printf("  - Speed: %.2f steps/sec\n", maxSpeed);
    // Serial.printf("  - Acceleration: %.2f steps/sec²\n", acceleration);
    // Serial.printf("  - Position Range: %ld to %ld steps\n", minPosition,
    //               maxPosition);
    // Serial.printf("  - Steps per inch: %.2f\n", stepsPerInch);

    StepperConfig *existingStepper = findStepperById(cfg_id);

    if (existingStepper) {
      Serial.printf("Updating stepper ID %s (%s)\n", cfg_id.c_str(),
                    name.c_str());

      // Store current values before updating
      float currentSpeed = existingStepper->maxSpeed;
      float currentAcceleration = existingStepper->acceleration;

      // Update basic properties
      existingStepper->name = name;
      existingStepper->minPosition = minPosition;
      existingStepper->maxPosition = maxPosition;
      existingStepper->stepsPerInch = stepsPerInch;

      // Update speed and acceleration, preserving existing values if not
      // specified
      existingStepper->maxSpeed =
          config.containsKey("maxSpeed") ? maxSpeed : currentSpeed;
      existingStepper->acceleration = config.containsKey("acceleration")
                                          ? acceleration
                                          : currentAcceleration;

      // Update homing properties
      existingStepper->homeSensorId = homeSensorId;
      existingStepper->homingDirection = homingDirection;
      existingStepper->homingSpeed = homingSpeed;
      existingStepper->homeSensorPinActiveState = homeSensorPinActiveState;
      existingStepper->homePositionOffset = homePositionOffset;

      // Update speed and acceleration in the FastAccelStepper instance
      if (existingStepper->stepper) {
        existingStepper->stepper->setSpeedInHz(existingStepper->maxSpeed);
        existingStepper->stepper->setAcceleration(
            existingStepper->acceleration);

        // Log the actual values being set
        Serial.printf("  - Updated speed: %.2f steps/sec\n",
                      existingStepper->maxSpeed);
        Serial.printf("  - Updated acceleration: %.2f steps/sec²\n",
                      existingStepper->acceleration);
      }
    } else {
      Serial.printf("Adding stepper ID %s (%s) on PUL %d, DIR %d, ENA %d\n",
                    cfg_id.c_str(), name.c_str(), pulPin, dirPin, enaPin);

      // Create new stepper config
      StepperConfig newConfig;
      newConfig.id = cfg_id;
      newConfig.name = name;
      newConfig.pulPin = pulPin;
      newConfig.dirPin = dirPin;
      newConfig.enaPin = enaPin;
      newConfig.minPosition = minPosition;
      newConfig.maxPosition = maxPosition;
      newConfig.stepsPerInch = stepsPerInch;
      newConfig.maxSpeed = maxSpeed;
      newConfig.acceleration = acceleration;
      newConfig.homeSensorId = homeSensorId;
      newConfig.homingDirection = homingDirection;
      newConfig.homingSpeed = homingSpeed;
      newConfig.homeSensorPinActiveState = homeSensorPinActiveState;
      newConfig.homePositionOffset = homePositionOffset;
      newConfig.isHomed = false;
      newConfig.isHoming = false;

      // Initialize the stepper
      if (initializeStepper(newConfig)) {
        configuredSteppers.push_back(newConfig);
        existingStepper = &configuredSteppers.back();
      } else {
        client->text(String(F("ERROR: Failed to create stepper on pin ")) +
                     String(pulPin));
        return;
      }
    }

    // Send success response
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
  StepperConfig *stepper = findStepperById(id);
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

    // Store command ID if provided (for sequence tracking)
    if (doc.containsKey("commandId")) {
      stepper->pendingCommandId = doc["commandId"].as<String>();
    }

    if (strcmp(command, "setParams") == 0) {
      // Update stepper parameters
      // Serial.printf("Updating parameters for stepper '%s':\n",
      //               stepper->name.c_str());

      float oldSpeed = stepper->maxSpeed;
      float oldAcceleration = stepper->acceleration;
      bool speedChanged = false;
      bool accelerationChanged = false;

      if (doc.containsKey("speed")) {
        stepper->maxSpeed = doc["speed"].as<float>();
        stepper->stepper->setSpeedInHz(stepper->maxSpeed);
        speedChanged = true;
        // Serial.printf("  - Speed updated: %.2f → %.2f steps/sec\n", oldSpeed,
        //               stepper->maxSpeed);
      }

      if (doc.containsKey("acceleration")) {
        stepper->acceleration = doc["acceleration"].as<float>();
        stepper->stepper->setAcceleration(stepper->acceleration);
        accelerationChanged = true;
        // Serial.printf("  - Acceleration updated: %.2f → %.2f steps/sec²\n",
        //               oldAcceleration, stepper->acceleration);
      }

      if (!speedChanged) {
        // Serial.printf("  - Speed unchanged: %.2f steps/sec\n",
        //               stepper->maxSpeed);
      }

      if (!accelerationChanged) {
        // Serial.printf("  - Acceleration unchanged: %.2f steps/sec²\n",
        //               stepper->acceleration);
      }

      if (doc.containsKey("minPosition")) {
        stepper->minPosition = doc["minPosition"].as<long>();
        // Serial.printf("  - Min position updated to %ld steps\n",
        //               stepper->minPosition);
      }

      if (doc.containsKey("maxPosition")) {
        stepper->maxPosition = doc["maxPosition"].as<long>();
        // Serial.printf("  - Max position updated to %ld steps\n",
        //               stepper->maxPosition);
      }

      if (doc.containsKey("stepsPerInch")) {
        stepper->stepsPerInch = doc["stepsPerInch"].as<float>();
        // Serial.printf("  - Steps per inch updated to %.2f\n",
        //               stepper->stepsPerInch);
      }

      // Update homing parameters
      if (doc.containsKey("homeSensorId"))
        stepper->homeSensorId = doc["homeSensorId"].as<String>();
      if (doc.containsKey("homingDirection"))
        stepper->homingDirection = doc["homingDirection"].as<int>();
      if (doc.containsKey("homingSpeed"))
        stepper->homingSpeed = doc["homingSpeed"].as<float>();
      if (doc.containsKey("homeSensorPinActiveState"))
        stepper->homeSensorPinActiveState =
            doc["homeSensorPinActiveState"].as<int>();
      if (doc.containsKey("homePositionOffset"))
        stepper->homePositionOffset = doc["homePositionOffset"].as<long>();

      client->text(String(F("OK: Stepper params updated for ")) + id);
    } else if (strcmp(command, "move") == 0) {
      if (doc.containsKey("value")) {
        long targetPos = doc["value"].as<long>();

        if (moveStepperToPosition(*stepper, targetPos)) {
          char buffer[100];
          snprintf(buffer, sizeof(buffer), "OK: Stepper %s moving to %ld",
                   id.c_str(), targetPos);
          client->text(buffer);
        } else {
          client->text(String(F("ERROR: Failed to move stepper ")) + id);
        }
      } else {
        client->text(F("ERROR: Missing 'value' for move command"));
      }
    } else if (strcmp(command, "step") == 0) {
      if (doc.containsKey("value")) {
        long steps = doc["value"].as<long>();

        if (moveStepperRelative(*stepper, steps)) {
          char buffer[128];
          snprintf(buffer, sizeof(buffer), "OK: Stepper %s stepping %ld",
                   id.c_str(), steps);
          client->text(buffer);
        } else {
          // If no actual movement due to clamping, send completion immediately
          if (!stepper->pendingCommandId.isEmpty()) {
            sendStepperActionComplete(*stepper, true);
            stepper->pendingCommandId = "";
          }
          client->text(String(F("OK: Stepper ")) + id +
                       F(" at limit, no movement"));
        }
      } else {
        client->text(F("ERROR: Missing 'value' for step command"));
      }
    } else if (strcmp(command, "home") == 0) {
      // Check if we have a home sensor configured
      if (!stepper->homeSensorId.isEmpty()) {
        Serial.printf("[StepperCard %s] Starting homing with sensor: %s\n",
                      id.c_str(), stepper->homeSensorId.c_str());
        // Use sensor-based homing
        if (homeStepperWithSensor(*stepper)) {
          client->text(String(F("OK: Stepper ")) + id +
                       F(" homing with sensor"));
        } else {
          client->text(String(F("ERROR: Failed to start homing for stepper ")) +
                       id);
        }
      } else {
        // No sensor, just move to middle position
        long homePos = (stepper->minPosition + stepper->maxPosition) / 2;
        if (moveStepperToPosition(*stepper, homePos)) {
          char buffer[100];
          snprintf(buffer, sizeof(buffer), "OK: Stepper %s homing to %ld",
                   id.c_str(), homePos);
          client->text(buffer);
        } else {
          client->text(String(F("ERROR: Failed to home stepper ")) + id);
        }
      }
    } else if (strcmp(command, "stop") == 0) {
      stopStepper(*stepper);
      client->text(String(F("OK: Stepper ")) + id + F(" emergency stop"));
    } else if (strcmp(command, "setCurrentPosition") == 0) {
      if (doc.containsKey("value")) {
        long newPosition = doc["value"].as<long>();

        if (setStepperCurrentPosition(*stepper, newPosition)) {
          char buffer[128];
          snprintf(buffer, sizeof(buffer),
                   "OK: Stepper %s current position set to %ld", id.c_str(),
                   newPosition);
          client->text(buffer);

          // Send an immediate position update to UI
          sendStepperPositionUpdate(*stepper);
        } else {
          client->text(F("ERROR: Failed to set position for stepper ")) + id;
        }
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
      cleanupStepper(*it);  // Clean up before erasing
      configuredSteppers.erase(it, configuredSteppers.end());
      client->text(String(F("OK: Stepper removed: ")) + id);
    } else {
      client->text(String(F("ERROR: Stepper not found for removal: ")) + id);
    }
  } else {
    client->text(F("ERROR: Unknown stepper action"));
  }
}