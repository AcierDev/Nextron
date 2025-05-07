#include "io_pin.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncWebSocket.h>

// Forward declaration for WebSocket instance
extern AsyncWebSocket ws;

// Initialize a pin based on its configuration
void initializePin(IoPinConfig &pinConfig) {
  // Setup pin based on mode and type
  if (pinConfig.mode == "output") {
    if (pinConfig.pinType == "digital") {
      pinMode(pinConfig.pin, OUTPUT);
      digitalWrite(pinConfig.pin, LOW);
    } else if (pinConfig.pinType == "pwm") {
      // Configure PWM for ESP32
      ledcSetup(pinConfig.pin % 16, 5000, 8);  // Channel, frequency, resolution
      ledcAttachPin(pinConfig.pin, pinConfig.pin % 16);
      ledcWrite(pinConfig.pin % 16, 0);
    }
    // For analog output, we use DAC which will be handled during write
    // operations
  } else {
    // Input mode with appropriate pull resistors
    if (pinConfig.pinType == "digital") {
      if (pinConfig.pullMode == PULL_UP) {
        pinMode(pinConfig.pin, INPUT_PULLUP);
      } else if (pinConfig.pullMode == PULL_DOWN) {
        pinMode(pinConfig.pin, INPUT_PULLDOWN);
      } else {
        pinMode(pinConfig.pin, INPUT);
      }
    } else {
      // Analog input - set pin appropriately
      pinMode(pinConfig.pin, INPUT);
    }
  }

  // Setup debouncer for digital inputs
  if (pinConfig.mode == "input" && pinConfig.pinType == "digital" &&
      pinConfig.debounceMs > 0) {
    if (pinConfig.debouncer) {
      delete pinConfig.debouncer;  // Clean up old debouncer if exists
    }
    pinConfig.debouncer = new Bounce();
    pinConfig.debouncer->attach(pinConfig.pin);
    pinConfig.debouncer->interval(pinConfig.debounceMs);
  }
}

// Clean up a pin (e.g., before reconfiguration or removal)
void cleanupPin(IoPinConfig &pinConfig) {
  // Clean up existing debouncer
  if (pinConfig.debouncer) {
    delete pinConfig.debouncer;
    pinConfig.debouncer = nullptr;
  }

  // Reset pin to safe state
  if (pinConfig.pinType == "pwm") {
    ledcDetachPin(pinConfig.pin);
  }

  // Set to input (safest mode)
  pinMode(pinConfig.pin, INPUT);
}

// Update and report pin values
void updatePinValues() {
  unsigned long now = millis();

  for (auto &pin : configuredPins) {
    if (pin.mode == "input") {
      bool shouldUpdate = false;
      int currentValue = 0;

      if (pin.pinType == "digital") {
        if (pin.debouncer) {
          // Use debouncer for digital inputs with debouncing enabled
          pin.debouncer->update();
          if (pin.debouncer->changed()) {
            currentValue = pin.debouncer->read();
            shouldUpdate = true;
          }
        } else {
          // Regular digital read for non-debounced pins
          currentValue = digitalRead(pin.pin);
          if (currentValue != pin.lastValue) {
            shouldUpdate = true;
          }
        }
      } else if (pin.pinType == "analog") {
        // Only read analog values at specified intervals
        if (now - lastPinReadTime[pin.id] >= analogInputReadInterval) {
          lastPinReadTime[pin.id] = now;
          currentValue = analogRead(pin.pin);

          // For analog, only update if value changed by more than 1%
          int threshold = 10;  // About 1% of 1023
          if (abs(currentValue - pin.lastValue) > threshold) {
            shouldUpdate = true;
          }
        }
      }

      if (shouldUpdate) {
        pin.lastValue = currentValue;

        // Send update to all websocket clients
        StaticJsonDocument<128> msg;
        msg["id"] = pin.id;
        msg["value"] = currentValue;
        msg["type"] = pin.pinType;
        msg["mode"] = pin.mode;

        String out;
        serializeJson(msg, out);
        ws.textAll(out);
      }
    }
  }
}