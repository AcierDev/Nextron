#ifndef MESSAGE_HANDLER_H
#define MESSAGE_HANDLER_H

#include <ArduinoJson.h>
#include <AsyncWebSocket.h>

#include "config.h"

// WebSocket server instance
extern AsyncWebServer server;
extern AsyncWebSocket ws;

// WebSocket message helpers
void sendWebSocketMessage(AsyncWebSocketClient *client, const String &message);
void broadcastWebSocketMessage(const String &message);

// Main WebSocket event handler
void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
                      AwsEventType type, void *arg, uint8_t *data, size_t len);

// Message handler function types
void handlePinMessage(AsyncWebSocketClient *client, JsonDocument &doc);
void handleServoMessage(AsyncWebSocketClient *client, JsonDocument &doc);
void handleStepperMessage(AsyncWebSocketClient *client, JsonDocument &doc);
void handleSystemMessage(AsyncWebSocketClient *client, JsonDocument &doc);

// Initialize WebSocket server
void initWebSocketServer();

#endif  // MESSAGE_HANDLER_H