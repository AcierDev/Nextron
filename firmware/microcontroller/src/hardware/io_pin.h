#ifndef IO_PIN_H
#define IO_PIN_H

#include "../config.h"

// Initialize a pin based on its configuration
void initializePin(IoPinConfig &pinConfig);

// Clean up a pin (e.g., before reconfiguration or removal)
void cleanupPin(IoPinConfig &pinConfig);

// Update and report pin values
void updatePinValues();

#endif  // IO_PIN_H