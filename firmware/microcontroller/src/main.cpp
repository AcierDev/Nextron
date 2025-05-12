#include <Arduino.h>

#include "config.h"
#include "hardware/io_pin.h"
#include "hardware/servo.h"
#include "hardware/stepper.h"
#include "message_handler.h"
#include "network/wifi_manager.h"

// FastAccelStepper engine setup
FastAccelStepperEngine engine = FastAccelStepperEngine();

// WebSocket and server instances
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

void setup() {
  Serial.begin(115200);
  delay(1000);  // Give serial monitor a chance to connect

  Serial.println(F("\n\n===== Everwood CNC Firmware Starting ====="));
  Serial.println(F("Version: 1.0.0"));
  Serial.println(F("Build Date: " __DATE__ " " __TIME__ "\n"));

  // Initialize WiFi connection
  initWiFi();

  // Initialize FastAccelStepper engine
  engine.init();

  // Initialize WebSocket server
  initWebSocketServer();

  Serial.println(F("System initialized and ready"));
  Serial.println(F("Waiting for web client connections..."));
}

void loop() {
  // Clean up WebSocket clients
  ws.cleanupClients();

  // Check and maintain WiFi connection
  updateWiFiStatus();

  // Check and update input pins
  updatePinValues();

  // Update and report stepper positions
  updateStepperPositions();

  // Update servo action status
  updateServoActionStatus();
}