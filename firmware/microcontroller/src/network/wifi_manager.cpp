#include "wifi_manager.h"

#include <Arduino.h>

#include "../config.h"

// Variables for IP printing
unsigned long ipPrintStopTime = 0;
unsigned long lastIpPrintTime = 0;

// Initialize WiFi connection
void initWiFi() {
  Serial.print(F("Connecting to WiFi"));
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(F("."));
  }

  Serial.print(F("\nConnected to "));
  Serial.println(ssid);
  Serial.print(F("IP_READY:"));
  Serial.println(WiFi.localIP());

  ipPrintStopTime = millis() + ipPrintDuration;
  lastIpPrintTime = millis();
}

// Print IP address information
void printIPAddress() {
  Serial.print(F("IP_READY:"));
  Serial.println(WiFi.localIP());
}

// Check and maintain WiFi connection
void updateWiFiStatus() {
  unsigned long now = millis();

  // Print IP address periodically during startup
  if (ipPrintStopTime && now < ipPrintStopTime &&
      now - lastIpPrintTime >= ipPrintInterval) {
    printIPAddress();
    lastIpPrintTime = now;
  }

  // Check if WiFi is still connected, attempt to reconnect if needed
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("WiFi connection lost. Reconnecting..."));
    WiFi.disconnect();
    WiFi.begin(ssid, password);
  }
}