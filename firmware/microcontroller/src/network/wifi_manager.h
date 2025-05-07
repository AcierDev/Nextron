#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFi.h>

// Initialize WiFi connection
void initWiFi();

// Print IP address information
void printIPAddress();

// Check and maintain WiFi connection
void updateWiFiStatus();

#endif  // WIFI_MANAGER_H