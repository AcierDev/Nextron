#include "config.h"

// --- Network Configuration ---
const char *ssid = "Everwood";
const char *password = "Everwood-Staff";

// --- Global Configuration Constants ---
const unsigned long analogInputReadInterval =
    100;  // Only poll analog inputs at this interval
const unsigned long stepperPositionReportInterval =
    100;  // Report position every 100ms if changed
const unsigned long ipPrintDuration = 15000;
const unsigned long ipPrintInterval = 1000;

// --- Global Data Structures ---
std::vector<IoPinConfig> configuredPins;
std::vector<ServoConfig> configuredServos;
std::vector<StepperConfig> configuredSteppers;
std::map<String, unsigned long> lastPinReadTime;

// --- Helper Functions ---
IoPinConfig *findPinById(const String &id) {
  for (auto &pinConfig : configuredPins) {
    if (pinConfig.id == id) return &pinConfig;
  }
  return nullptr;
}

ServoConfig *findServoById(const String &id) {
  for (auto &servoConfig : configuredServos) {
    if (servoConfig.id == id) return &servoConfig;
  }
  return nullptr;
}

StepperConfig *findStepperById(const String &id) {
  for (auto &stepper : configuredSteppers) {
    if (stepper.id == id) {
      return &stepper;
    }
  }
  return nullptr;
}