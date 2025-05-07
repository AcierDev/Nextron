#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <Bounce2.h>
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
  int channel = -1;  // LEDC channel for this servo
  bool isAttached = false;

  // Configuration
  int minAngle = 0;
  int maxAngle = 180;
  int minPulseWidth = 500;   // Pulse width in microseconds for 0 degrees
  int maxPulseWidth = 2400;  // Pulse width in microseconds for 180 degrees

  // Speed control variables
  int speed = 100;        // Default speed (1-100)
  int currentAngle = 90;  // Current angle position (degrees)
  int targetAngle = 90;   // Target angle to move to (degrees)

  // For smooth motion using direct PWM
  int currentPulseWidth =
      -1;  // Current pulse width in microseconds, -1 means not set
  int targetPulseWidth = -1;       // Target pulse width in microseconds
  unsigned long lastMoveTime = 0;  // Last time the pulse width was updated
  bool isMoving = false;           // Whether the servo is currently in motion
};

// --- Stepper Configuration ---
struct StepperConfig {
  String id;
  String name;
  uint8_t pulPin;
  uint8_t dirPin;
  uint8_t enaPin = 0;  // Optional enable pin, 0 if not used
  FastAccelStepper* stepper = nullptr;
  long currentPosition = 0;
  long targetPosition = 0;
  float maxSpeed = 100000.0;     // Increased default max speed
  float acceleration = 50000.0;  // Increased default acceleration
  long minPosition = -50000;     // Min position limit
  long maxPosition = 50000;      // Max position limit
  float stepsPerInch = 200.0;    // For unit conversion
  unsigned long lastPositionReportTime = 0;
};

// --- Global Configuration Constants ---
// Timing constants
extern const unsigned long
    analogInputReadInterval;  // Only poll analog inputs at this interval
extern const unsigned long
    stepperPositionReportInterval;  // Report position every 100ms if changed
extern const unsigned long ipPrintDuration;
extern const unsigned long ipPrintInterval;

// --- Global Data Structures ---
extern std::vector<IoPinConfig> configuredPins;
extern std::vector<ServoConfig> configuredServos;
extern std::vector<StepperConfig> configuredSteppers;
extern std::map<String, unsigned long> lastPinReadTime;

// --- Forward declarations of helper functions ---
IoPinConfig* findPinById(const String& id);
ServoConfig* findServoById(const String& id);
StepperConfig* findStepperById(const String& id);

#endif  // CONFIG_H