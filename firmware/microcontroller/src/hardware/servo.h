#ifndef SERVO_H
#define SERVO_H

#include "../config.h"

// Convert angle (degrees) to pulse width (microseconds)
int angleToPulseWidth(const ServoConfig &config, int angle);

// Convert pulse width (microseconds) to angle (degrees)
int pulseWidthToAngle(const ServoConfig &config, int pulseWidth);

// Attach a servo using ESP32 LEDC peripheral
void attachServoPWM(ServoConfig &servoConfig);

// Detach a servo from LEDC
void detachServoPWM(ServoConfig &servoConfig);

// Set servo position by writing pulse width with microsecond precision
void setServoPulseWidth(ServoConfig &servoConfig, int pulseWidth_us);

// Update servo movements based on speed and target positions
void updateServoMovements();

#endif  // SERVO_H