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
  Serial.printf("DEBUG: findServoById called for id='%s'\n", id.c_str());
  Serial.printf("DEBUG: Searching through %d configured servos\n",
                configuredServos.size());

  if (configuredServos.empty()) {
    Serial.println("DEBUG: No servos configured yet!");
    return nullptr;
  }

  for (size_t i = 0; i < configuredServos.size(); i++) {
    auto &servoConfig = configuredServos[i];
    Serial.printf("DEBUG: Comparing with servo[%d] id='%s'\n", i,
                  servoConfig.id.c_str());

    if (servoConfig.id == id) {
      Serial.printf("DEBUG: Found matching servo at index %d\n", i);
      return &servoConfig;
    }
  }

  Serial.printf("DEBUG: No servo found with id='%s'\n", id.c_str());
  // If we can't find it, dump all servo configurations to help diagnose
  debugPrintServoConfigurations();
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