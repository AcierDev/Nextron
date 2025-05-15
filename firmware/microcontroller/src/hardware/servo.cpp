#include "servo.h"

#include <Arduino.h>
#include <ArduinoJson.h>

// Forward declaration for WebSocket instance
extern AsyncWebSocket ws;

// Initialize a servo based on its configuration
void initializeServo(ServoConfig &servoConfig) {
  Serial.printf("DEBUG INIT: Initializing servo %s on pin %d\n",
                servoConfig.id.c_str(), servoConfig.pin);

  // Clean up any existing attachment
  if (servoConfig.servo.attached()) {
    Serial.printf(
        "DEBUG INIT: Servo was already attached to pin %d, detaching first\n",
        servoConfig.pin);
    cleanupServo(servoConfig);
  }

  // Force detach this servo too to be extra safe
  servoConfig.servo.detach();

  // Allocate a channel if not already assigned
  if (servoConfig.channel < 0) {
    servoConfig.channel = allocateServoChannel();
    if (servoConfig.channel < 0) {
      Serial.printf(
          "DEBUG INIT: ERROR - Failed to allocate PWM channel for servo %s\n",
          servoConfig.id.c_str());
      return;
    }
  }

  // Attach with explicit channel - using ServoESP32 library format
  servoConfig.servo.attach(servoConfig.pin, servoConfig.channel,
                           servoConfig.minAngle, servoConfig.maxAngle,
                           servoConfig.minPulseWidth, servoConfig.maxPulseWidth,
                           200  // Default frequency of 200Hz for ESP32
  );

  // Move to initial position if attached
  if (servoConfig.servo.attached()) {
    servoConfig.servo.write(servoConfig.currentAngle);
    Serial.printf("DEBUG INIT: Servo %s attached to pin %d using channel %d\n",
                  servoConfig.id.c_str(), servoConfig.pin, servoConfig.channel);
  } else {
    Serial.printf(
        "DEBUG INIT: ERROR - Failed to attach servo to pin %d with channel "
        "%d\n",
        servoConfig.pin, servoConfig.channel);
    // Release the channel since attachment failed
    releaseServoChannel(servoConfig.channel);
    servoConfig.channel = -1;
  }

  Serial.printf("Servo %s: Initialized on pin %d, attached=%s\n",
                servoConfig.id.c_str(), servoConfig.pin,
                servoConfig.servo.attached() ? "true" : "false");
}

// Clean up a servo (e.g., before reconfiguration or removal)
void cleanupServo(ServoConfig &servoConfig) {
  servoConfig.servo.detach();

  // Release the channel if it was assigned
  if (servoConfig.channel >= 0) {
    releaseServoChannel(servoConfig.channel);
    servoConfig.channel = -1;
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
  if (!servoConfig.servo.attached()) {
    Serial.println("SERVO NOT ATTACHED");
    initializeServo(servoConfig);

    if (!servoConfig.servo.attached()) {
      Serial.printf("Servo %s: Failed to attach during move\n",
                    servoConfig.id.c_str());
      return false;
    }
  }

  // Save previous angle for calculating duration
  servoConfig.previousAngle = servoConfig.currentAngle;

  // Store target angle
  servoConfig.targetAngle = angle;

  // In ServoESP32 library, we don't have pinNumber property
  // Just write the angle directly
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

// Send action completion notification
void sendServoActionComplete(const ServoConfig &config, bool success,
                             const String &errorMsg) {
  if (config.pendingCommandId.isEmpty())
    return;  // No pending command to complete

  StaticJsonDocument<256> completionMsg;
  completionMsg["type"] = "actionComplete";
  completionMsg["componentId"] = config.id;
  completionMsg["componentGroup"] = "servos";
  completionMsg["commandId"] = config.pendingCommandId;
  completionMsg["success"] = success;
  completionMsg["angle"] = config.currentAngle;

  if (!success && !errorMsg.isEmpty()) {
    completionMsg["error"] = errorMsg;
  }

  String completionJson;
  serializeJson(completionMsg, completionJson);
  ws.textAll(completionJson);

  Serial.printf("Servo '%s': Action %s for command %s at angle %d\n",
                config.id.c_str(), success ? "completed" : "failed",
                config.pendingCommandId.c_str(), config.currentAngle);
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
          sendServoActionComplete(servo, true);
          // Clear the pending command ID
          servo.pendingCommandId = "";
        }
      }
    }
  }
}

// Handle servo-related WebSocket messages
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

    // Optional channel specification - if not provided, one will be allocated
    int channel = -1;
    if (config.containsKey("channel")) {
      channel = config["channel"];
      // Validate channel range
      if (channel < 0 || channel >= MAX_SERVO_CHANNELS) {
        client->text(F("ERROR: Invalid servo channel (must be 0-15)"));
        return;
      }
      // Check if channel is already in use by another servo
      if (servoChannelUsed[channel]) {
        // Find if it's used by this servo (which is ok) or another one (which
        // is not)
        bool usedBySelf = false;
        ServoConfig *existingServo = findServoById(cfg_id);
        if (existingServo && existingServo->channel == channel) {
          usedBySelf = true;
        }

        if (!usedBySelf) {
          client->text(
              F("ERROR: Servo channel already in use by another servo"));
          return;
        }
      }
    }

    Serial.printf(
        "DEBUG CONFIG: Received configure for servo id=%s, name=%s, pin=%d, "
        "channel=%d\n",
        cfg_id.c_str(), name.c_str(), pin, channel);

    if (cfg_id.isEmpty() || name.isEmpty() || pin == 0) {
      client->text(F("ERROR: Missing servo config fields (id, name, pin)"));
      return;
    }

    // Check if any other servo is already using this pin
    for (auto &servo : configuredServos) {
      if (servo.id != cfg_id && servo.pin == pin) {
        Serial.printf(
            "DEBUG CONFIG: WARNING - Pin %d is already in use by servo %s\n",
            pin, servo.id.c_str());
      }
    }

    ServoConfig *existingServo = findServoById(cfg_id);

    if (existingServo) {
      Serial.printf(
          "DEBUG CONFIG: Updating existing servo %s, changing pin from %d to "
          "%d\n",
          cfg_id.c_str(), existingServo->pin, pin);
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

      // Set channel if specified, otherwise it will be allocated in
      // initializeServo
      if (channel >= 0) {
        existingServo->channel = channel;
        servoChannelUsed[channel] = true;
      }

      // Initialize with new configuration
      initializeServo(*existingServo);
    } else {
      Serial.printf("DEBUG CONFIG: Creating new servo %s on pin %d\n",
                    cfg_id.c_str(), pin);
      ServoConfig newServo;
      newServo.id = cfg_id;
      newServo.name = name;
      newServo.pin = pin;
      newServo.minAngle = minAngle;
      newServo.maxAngle = maxAngle;
      newServo.minPulseWidth = minPulseWidth;
      newServo.maxPulseWidth = maxPulseWidth;
      newServo.currentAngle = initialAngle;

      // Set channel if specified, otherwise it will be allocated in
      // initializeServo
      if (channel >= 0) {
        newServo.channel = channel;
        servoChannelUsed[channel] = true;
      }

      // Initialize the servo
      initializeServo(newServo);
      configuredServos.push_back(newServo);

      Serial.printf(
          "DEBUG CONFIG: After adding, now have %d servos configured\n",
          configuredServos.size());
    }

    // Send success response
    StaticJsonDocument<256> response;
    response["status"] = F("OK");
    response["message"] = F("Servo configured");
    response["id"] = cfg_id;
    response["componentGroup"] = F("servos");
    response["channel"] = existingServo ? existingServo->channel
                                        : configuredServos.back().channel;
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