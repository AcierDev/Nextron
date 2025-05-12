#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <Bounce2.h>
#include <ESP32Servo.h>  // Add standard servo library
#include <FastAccelStepper.h>

#include <map>
#include <vector>

// --- Network Configuration ---
extern const char* ssid;
extern const char* password;

// --- Pin Configuration ---
enum PinPullMode { PULL_NONE = 0, PULL_UP = 1, PULL_DOWN = 2 };

struct IoPinConfig {
  String id;
  String name;
  uint8_t pin;
  String pinType;  // "digital", "analog", or "pwm"
  String mode;     // "input" or "output"
  int lastValue;   // Last read or written value
  PinPullMode pullMode;
  uint16_t debounceMs;
  Bounce* debouncer;  // Only used for digital inputs
};

// --- Servo Configuration ---
struct ServoConfig {
  String id;
  String name;
  uint8_t pin;
  Servo servo;  // Standard servo instance
  bool isAttached = false;

  // Configuration
  int minAngle = 0;
  int maxAngle = 180;
  int minPulseWidth = 500;   // Default minimum pulse width in microseconds
  int maxPulseWidth = 2400;  // Default maximum pulse width in microseconds
  int speed = 100;           // Movement speed (1-100%)

  int currentAngle = 90;   // Current angle position (degrees)
  int targetAngle = 90;    // Target angle for movement
  int previousAngle = 90;  // Previous angle before movement started

  // Movement timing
  unsigned long moveStartTime = 0;  // When movement started (millis)
  unsigned long moveDuration = 0;   // Expected duration of movement (ms)

  // Action completion tracking for sequence execution
  bool isActionPending = false;  // Whether a sequence action is in progress
  String pendingCommandId = "";  // ID of the pending sequence command (if any)
};

// --- Stepper Configuration ---
struct StepperConfig {
  String id;
  String name;
  uint8_t pulPin = 0;
  uint8_t dirPin = 0;
  uint8_t enaPin = 0;
  FastAccelStepper* stepper = nullptr;
  float maxSpeed = 1000.0;  // Steps per second
  float acceleration = 500.0;
  long minPosition = -50000;
  long maxPosition = 50000;
  long currentPosition = 0;
  long targetPosition = 0;
  float stepsPerInch = 200.0;  // Default: 200 steps = 1 inch
  bool isHomed = false;
  unsigned long lastPositionReportTime = 0;

  String homeSensorId;           // ID of the IoPinConfig to use as a sensor
  int homingDirection;           // -1 for negative, 1 for positive movement
  float homingSpeed;             // Speed in steps/sec for the homing move
  bool isHoming;                 // Flag to indicate a homing sequence is active
  int homeSensorPinActiveState;  // The state (LOW or HIGH) that indicates
                                 // sensor trigger
  long homePositionOffset;

  // Action completion tracking
  bool isActionPending = false;  // Whether an action is in progress
  String pendingCommandId = "";  // ID of the pending command (if any)
};

// --- Global Configuration Constants ---
// Timing constants
extern const unsigned long
    analogInputReadInterval;  // Only poll analog inputs at this interval
extern const unsigned long
    stepperPositionReportInterval;  // Report position every 100ms if changed
extern const unsigned long ipPrintDuration;
extern const unsigned long ipPrintInterval;
// Servo speed: 0.23 seconds per 60 degrees
// (0.4666 * 1000 ms) / 60 degrees = 7.7777... ms per degree
const float SERVO_MS_PER_DEGREE_FULL_SPEED = 7.7777f;

// --- Global Data Structures ---
extern std::vector<IoPinConfig> configuredPins;
extern std::vector<ServoConfig> configuredServos;
extern std::vector<StepperConfig> configuredSteppers;
extern std::map<String, unsigned long> lastPinReadTime;

// --- Forward declarations of helper functions ---
IoPinConfig* findPinById(const String& id);
ServoConfig* findServoById(const String& id);
StepperConfig* findStepperById(const String& id);

// --- Debug printing functions for configuration diagnostics ---
inline void debugPrintServoConfigurations() {
  Serial.println(F("===== SERVO CONFIGURATION DIAGNOSTICS ====="));
  Serial.printf("Total configured servos: %d\n", configuredServos.size());

  for (size_t i = 0; i < configuredServos.size(); i++) {
    const auto& servo = configuredServos[i];
    Serial.printf(
        "Servo[%d]: id='%s', name='%s', pin=%d, range=[%d-%d], "
        "pulseWidth=[%d-%d], angle=%d, attached=%s\n",
        i, servo.id.c_str(), servo.name.c_str(), servo.pin, servo.minAngle,
        servo.maxAngle, servo.minPulseWidth, servo.maxPulseWidth,
        servo.currentAngle, servo.isAttached ? "true" : "false");
  }
  Serial.println(F("=========================================="));
}

#endif  // CONFIG_H