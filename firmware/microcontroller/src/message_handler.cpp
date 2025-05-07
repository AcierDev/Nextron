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
  Serial.println("WebSocket server started");
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
          client->text("ERROR: Invalid JSON");
          return;
        }

        // Debug: Print received message to Serial
        Serial.println("Received JSON message:");
        serializeJsonPretty(doc, Serial);
        Serial.println();

        const char *action = doc["action"];
        const char *group = doc["componentGroup"];

        if (!action) {
          client->text("ERROR: Missing action field");
          return;
        }

        if (!group) {
          client->text("ERROR: Missing componentGroup field");
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
          client->text("ERROR: Unhandled component group");
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
    response["status"] = "OK";
    response["action"] = "pong";
    response["componentGroup"] = "system";
    response["timestamp"] = doc["timestamp"];  // Echo timestamp

    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);
  } else {
    client->text("ERROR: Unknown system action");
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

    if (id.isEmpty() || name.isEmpty()) {
      client->text("ERROR: Missing required config fields for pin");
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
    response["status"] = "OK";
    response["message"] = "Pin configured";
    response["id"] = id;
    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);

  } else if (strcmp(action, "readPin") == 0) {
    String id = doc["id"];
    IoPinConfig *pinToRead = findPinById(id);
    if (!pinToRead) {
      client->text("ERROR: Pin not found");
      return;
    }
    if (pinToRead->mode != "input") {
      client->text("ERROR: Pin is not configured as input");
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
    response["status"] = "OK";
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
      client->text("ERROR: Pin not found");
      return;
    }
    if (pinToWrite->mode != "output") {
      client->text("ERROR: Pin is not configured as output");
      return;
    }

    if (type == "digital") {
      digitalWrite(pinToWrite->pin, value ? HIGH : LOW);
    } else if (type == "pwm") {
      ledcWrite(pinToWrite->pin % 16, value);
    } else if (type == "analog") {  // ESP32 DAC
      if (pinToWrite->pin == 25 || pinToWrite->pin == 26) {
        dacWrite(pinToWrite->pin, constrain(value, 0, 255));
      } else {
        client->text("ERROR: Pin does not support analog output (DAC)");
        return;
      }
    }
    pinToWrite->lastValue = value;
    StaticJsonDocument<128> response;
    response["status"] = "OK";
    response["message"] = "Pin value updated";
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
      client->text("OK: Pin removed");
    } else {
      client->text("ERROR: Pin not found for removal");
    }
  } else {
    client->text("ERROR: Unknown pin action");
  }
}

void handleServoMessage(AsyncWebSocketClient *client, JsonDocument &doc) {
  const char *action = doc["action"];
  String id = doc["id"];  // Common for most servo actions

  ServoConfig *servo = findServoById(id);

  if (strcmp(action, "configure") == 0) {
    JsonObject config = doc["config"];
    String cfg_id = config["id"];  // ID from config object
    String name = config["name"];
    uint8_t pin = config["pin"];
    int minAngle = config["minAngle"] | 0;
    int maxAngle = config["maxAngle"] | 180;
    int minPulseWidth = config["minPulseWidth"] | 500;
    int maxPulseWidth = config["maxPulseWidth"] | 2400;
    bool hasSpeedConfig = config.containsKey("speed");
    int speedVal = hasSpeedConfig ? config["speed"].as<int>() : 100;

    if (cfg_id.isEmpty() || name.isEmpty() || pin == 0) {
      client->text(
          "ERROR: Missing required servo config fields (id, name, pin)");
      return;
    }

    ServoConfig *existingServo =
        findServoById(cfg_id);  // Use ID from config for finding/creating

    if (existingServo) {
      Serial.printf("Reconfiguring servo %s (Pin %d)\n", cfg_id.c_str(), pin);
      if (existingServo->pin != pin || !existingServo->isAttached) {
        detachServoPWM(*existingServo);
        existingServo->pin = pin;
      }
      existingServo->name = name;
      existingServo->minAngle = minAngle;
      existingServo->maxAngle = maxAngle;
      existingServo->minPulseWidth = minPulseWidth;
      existingServo->maxPulseWidth = maxPulseWidth;
      if (hasSpeedConfig) {
        existingServo->speed = constrain(speedVal, 1, 100);
      }
      attachServoPWM(*existingServo);
      // Update current pulse width based on new angle/PWM settings
      setServoPulseWidth(
          *existingServo,
          angleToPulseWidth(*existingServo, existingServo->currentAngle));
    } else {
      Serial.printf("Adding new servo %s (Pin %d)\n", cfg_id.c_str(), pin);
      ServoConfig newConfig;
      newConfig.id = cfg_id;
      newConfig.name = name;
      newConfig.pin = pin;
      newConfig.minAngle = minAngle;
      newConfig.maxAngle = maxAngle;
      newConfig.minPulseWidth = minPulseWidth;
      newConfig.maxPulseWidth = maxPulseWidth;
      newConfig.speed = constrain(speedVal, 1, 100);
      newConfig.currentAngle = 90;  // Sensible default
      newConfig.currentPulseWidth =
          angleToPulseWidth(newConfig, newConfig.currentAngle);
      newConfig.targetAngle = newConfig.currentAngle;
      newConfig.targetPulseWidth = newConfig.currentPulseWidth;

      attachServoPWM(newConfig);
      configuredServos.push_back(newConfig);
      existingServo = &configuredServos.back();  // Get pointer to the new servo
    }

    StaticJsonDocument<256> response;
    response["status"] = "OK";
    response["message"] = "Servo configured";
    response["id"] =
        existingServo->id;  // Use ID from the (potentially new) servo
    response["pin"] = existingServo->pin;
    response["minAngle"] = existingServo->minAngle;
    response["maxAngle"] = existingServo->maxAngle;
    response["minPulseWidth"] = existingServo->minPulseWidth;
    response["maxPulseWidth"] = existingServo->maxPulseWidth;
    response["speed"] = existingServo->speed;
    response["currentAngle"] = existingServo->currentAngle;
    response["componentGroup"] = "servos";
    String jsonResponse;
    serializeJson(response, jsonResponse);
    client->text(jsonResponse);
    return;  // Exit after configure
  }

  // For other actions, servo must exist
  if (!servo) {
    client->text("ERROR: Servo not found for control/action: " + id);
    return;
  }

  if (strcmp(action, "control") == 0) {
    StaticJsonDocument<128> response;  // For success responses
    response["id"] = servo->id;
    response["componentGroup"] = "servos";
    bool action_taken = false;

    if (doc.containsKey("speed")) {
      servo->speed = constrain(doc["speed"].as<int>(), 1, 100);
      response["status"] = "OK";
      response["speed"] = servo->speed;
      action_taken = true;
    }
    if (doc.containsKey("angle")) {
      int angleCmd = doc["angle"];
      servo->targetAngle =
          constrain(angleCmd, servo->minAngle, servo->maxAngle);
      servo->targetPulseWidth = angleToPulseWidth(*servo, servo->targetAngle);
      servo->isMoving = true;

      // Immediate move if speed is 100% (or an 'immediate' flag was used
      // previously)
      if (servo->speed >= 100) {
        setServoPulseWidth(*servo, servo->targetPulseWidth);
        servo->isMoving = false;
      }
      response["status"] = "OK";
      response["targetAngle"] = servo->targetAngle;
      response["currentAngle"] = servo->currentAngle;
      action_taken = true;
    }
    if (doc.containsKey("command")) {
      String cmd = doc["command"].as<String>();
      action_taken = true;
      if (cmd == "attach") {
        attachServoPWM(*servo);
        response["status"] = "OK";
        response["message"] = "Servo attached";
      } else if (cmd == "detach") {
        detachServoPWM(*servo);
        response["status"] = "OK";
        response["message"] = "Servo detached";
      } else if (cmd == "reset") {
        servo->targetAngle = constrain(90, servo->minAngle, servo->maxAngle);
        servo->targetPulseWidth = angleToPulseWidth(*servo, servo->targetAngle);
        servo->isMoving = true;
        response["status"] = "OK";
        response["targetAngle"] = servo->targetAngle;
      } else if (cmd == "setAngle") {  // Similar to 'angle' key
        if (doc.containsKey("value")) {
          int angleCmd = doc["value"];
          servo->targetAngle =
              constrain(angleCmd, servo->minAngle, servo->maxAngle);
          servo->targetPulseWidth =
              angleToPulseWidth(*servo, servo->targetAngle);
          servo->isMoving = true;
          if (servo->speed >= 100) {  // immediate
            setServoPulseWidth(*servo, servo->targetPulseWidth);
            servo->isMoving = false;
          }
          response["status"] = "OK";
          response["targetAngle"] = servo->targetAngle;
          response["currentAngle"] = servo->currentAngle;
        } else {
          response["status"] = "ERROR";
          response["message"] = "Missing 'value' for setAngle";
        }
      } else if (cmd == "stop") {  // Stop gradual movement
        servo->isMoving = false;
        response["status"] = "OK";
        response["message"] = "Servo movement stopped";
        response["angle"] = servo->currentAngle;
      } else {
        response["status"] = "ERROR";
        response["message"] = "Unknown servo command";
        action_taken = false;
      }
    }

    if (action_taken) {
      String jsonResponse;
      serializeJson(response, jsonResponse);
      client->text(jsonResponse);
    } else if (!doc.containsKey("speed") && !doc.containsKey("angle") &&
               !doc.containsKey("command")) {
      client->text(
          "ERROR: No valid control key (speed, angle, command) for servo");
    }
  } else if (strcmp(action, "remove") == 0) {
    auto it = std::remove_if(configuredServos.begin(), configuredServos.end(),
                             [&](const ServoConfig &s) { return s.id == id; });
    if (it != configuredServos.end()) {
      detachServoPWM(*it);  // Detach before erasing
      configuredServos.erase(it, configuredServos.end());
      client->text("OK: Servo removed: " + id);
    } else {
      client->text("ERROR: Servo not found for removal: " + id);
    }
  } else {
    client->text("ERROR: Unknown servo action");
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
          "ERROR: Missing stepper config fields (id, name, pulPin, dirPin)");
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
        client->text("ERROR: Failed to create stepper on pin " +
                     String(pulPin));
        return;
      }
    }
    StaticJsonDocument<256> response;
    response["status"] = "OK";
    response["message"] = "Stepper configured";
    response["id"] = existingStepper->id;
    response["minPosition"] = existingStepper->minPosition;
    response["maxPosition"] = existingStepper->maxPosition;
    response["stepsPerInch"] = existingStepper->stepsPerInch;
    response["componentGroup"] = "steppers";
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
      client->text("ERROR: Missing 'command' for stepper control");
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

      client->text("OK: Stepper params updated for " + id);
    } else if (strcmp(command, "move") == 0) {
      if (doc.containsKey("value")) {
        long targetPos = clampPosition(stepper, doc["value"].as<long>());
        stepper->stepper->moveTo(targetPos);
        stepper->targetPosition = targetPos;
        client->text("OK: Stepper " + id + " moving to " + String(targetPos));
      } else {
        client->text("ERROR: Missing 'value' for move command");
      }
    } else if (strcmp(command, "step") == 0) {
      if (doc.containsKey("value")) {
        long steps = doc["value"].as<long>();
        long currentPos = stepper->stepper->getCurrentPosition();
        long newPos = clampPosition(stepper, currentPos + steps);
        steps = newPos - currentPos;  // Recalculate steps based on clamping
        if (steps != 0) {
          stepper->stepper->move(steps);
          stepper->targetPosition = newPos;
        }
        client->text("OK: Stepper " + id + " stepping " + String(steps) +
                     " to " + String(newPos));
      } else {
        client->text("ERROR: Missing 'value' for step command");
      }
    } else if (strcmp(command, "home") == 0) {
      long homePos = (stepper->minPosition + stepper->maxPosition) / 2;
      stepper->stepper->moveTo(homePos);
      stepper->targetPosition = homePos;
      client->text("OK: Stepper " + id + " homing to " + String(homePos));
    } else if (strcmp(command, "stop") == 0) {
      stepper->stepper->forceStop();
      client->text("OK: Stepper " + id + " emergency stop");
    } else {
      client->text("ERROR: Unknown stepper command");
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
      client->text("OK: Stepper removed: " + id);
    } else {
      client->text("ERROR: Stepper not found for removal: " + id);
    }
  } else {
    client->text("ERROR: Unknown stepper action");
  }
}