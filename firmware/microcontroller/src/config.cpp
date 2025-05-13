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

// --- Servo Channel Tracking ---
bool servoChannelUsed[MAX_SERVO_CHANNELS] = {
    false};  // All channels initially free

// --- Helper Functions ---
IoPinConfig *findPinById(const String &id) {
  for (auto &pinConfig : configuredPins) {
    if (pinConfig.id == id) return &pinConfig;
  }
  return nullptr;
}

ServoConfig *findServoById(const String &id) {
  if (configuredServos.empty()) {
    Serial.println("DEBUG: No servos configured yet!");
    return nullptr;
  }

  for (size_t i = 0; i < configuredServos.size(); i++) {
    auto &servoConfig = configuredServos[i];

    if (servoConfig.id == id) {
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

// Allocate a free servo channel
int allocateServoChannel() {
  // First, try to find a free channel
  for (int i = 0; i < MAX_SERVO_CHANNELS; i++) {
    if (!servoChannelUsed[i]) {
      servoChannelUsed[i] = true;
      Serial.printf("DEBUG: Allocated servo channel %d\n", i);
      return i;
    }
  }

  // If no free channel is found, return -1
  Serial.println("ERROR: No free servo channels available!");
  return -1;
}

// Release a servo channel when it's no longer needed
void releaseServoChannel(int channel) {
  if (channel >= 0 && channel < MAX_SERVO_CHANNELS) {
    servoChannelUsed[channel] = false;
    Serial.printf("DEBUG: Released servo channel %d\n", channel);
  }
}