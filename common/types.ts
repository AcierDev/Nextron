import { ObjectId } from "mongodb"; // Needs mongodb as dependency

/**
 * Represents a single configured hardware component.
 */
export interface ConfiguredComponent {
  id: string;
  name: string;
  type: string; // e.g., 'Servo', 'Stepper', 'DHT22', 'Digital Output', 'Relay'
  pins: number[];
  // Servo specific
  minAngle?: number;
  maxAngle?: number;
  presets?: number[]; // Added for servo presets
  speed?: number; // Added for servo speed config
  // Stepper specific
  maxSpeed?: number;
  acceleration?: number;
  stepsPerInch?: number; // Added
  minPosition?: number; // Added
  maxPosition?: number; // Added
  jogUnit?: "steps" | "inches"; // Added
  jogAmount?: number; // Added - for steps
  jogAmountInches?: number; // Added - for inches
  // Stepper Homing specific
  homeSensorId?: string | null;
  homingDirection?: number;
  homingSpeed?: number;
  homeSensorPinActiveState?: number; // e.g. 0 for LOW, 1 for HIGH
  homePositionOffset?: number;
  isHoming?: boolean; // Runtime state, but can be part of config if needed
  pullMode?: number;
  debounceMs?: number;
}

/**
 * Defines the overall hardware configuration structure.
 */
export interface HardwareConfig {
  servos: ConfiguredComponent[];
  steppers: ConfiguredComponent[];
  sensors: ConfiguredComponent[];
  relays: ConfiguredComponent[];
  pins: ConfiguredComponent[]; // Represents IO pins (digital/analog in/out)
}

/**
 * Structure for documents stored in the MongoDB 'configs' collection.
 */
export interface SavedConfigDocument {
  _id: ObjectId; // Handled by MongoDB driver
  name: string;
  description?: string;
  hardware: HardwareConfig;
  sequences?: Sequence[]; // Moved here
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Structure for config list items sent via IPC (ObjectId converted to string).
 */
export interface AvailableConfigIPC {
  _id: string;
  name: string;
}

/**
 * Structure for full config data sent via IPC (ObjectId converted to string).
 */
export interface FullConfigDataIPC extends AvailableConfigIPC {
  description?: string;
  hardware: HardwareConfig;
  createdAt?: string; // Dates might be serialized as strings
  updatedAt?: string;
  sequences?: Sequence[]; // Add sequences here as well for IPC
}

// --- NEW SEQUENCE RECORDER TYPES ---

/**
 * Base interface for all sequence steps.
 */
export interface BaseStep {
  id: string; // Unique identifier for the step (e.g., UUID)
}

/**
 * Represents a step that performs an action on a device.
 */
export interface ActionStep extends BaseStep {
  type: "action";
  deviceId: string; // ID of the ConfiguredComponent
  // To help UI and logic distinguish, we can use the keys of HardwareConfig
  deviceComponentGroup: keyof HardwareConfig; // "servos", "steppers", "pins", "relays" (sensors unlikely to be actioned)
  action: string; // The command to execute (e.g., "moveTo", "setAngle", "digitalWrite")
  value: any; // The value for the command (e.g., position, angle, true/false, 0/1)
  // Optional parameters that might be specific to certain actions/devices
  speed?: number;
  acceleration?: number;
}

/**
 * Represents a delay in the sequence.
 */
export interface DelayStep extends BaseStep {
  type: "delay";
  duration: number; // Duration of the delay in milliseconds
}

/**
 * Union type for all possible steps in a sequence.
 */
export type SequenceStep = ActionStep | DelayStep;

/**
 * Defines the structure of a sequence.
 */
export interface Sequence {
  id: string; // Unique ID for the sequence (e.g., UUID)
  name: string;
  description?: string;
  steps: SequenceStep[];
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

/**
 * Simplified device representation for UI purposes, especially in the sequence editor.
 */
export interface DeviceDisplay {
  id: string; // Corresponds to ConfiguredComponent.id
  name: string; // Corresponds to ConfiguredComponent.name
  componentGroup: keyof HardwareConfig; // "servos", "steppers", "pins", "relays"
  // We can add more specific properties from ConfiguredComponent if needed for UI hinting
  // For example, min/max ranges for sliders, available actions etc.
  originalType: string; // from ConfiguredComponent.type, for more specific info if needed
}

// --- END NEW SEQUENCE RECORDER TYPES ---

export interface BaseComponentConfig {
  id: string;
  name: string;
}

export type PinType = "digital" | "analog" | "pwm";
export type PinMode = "input" | "output";
// Assuming 0: NONE, 1: PULL_UP, 2: PULL_DOWN based on IOPinCard state and C++ enum order
export type PullMode = 0 | 1 | 2;

export interface IoPinComponentConfig extends BaseComponentConfig {
  componentType: "IoPin";
  pin: number;
  pinType: PinType;
  mode: PinMode;
  pullMode?: PullMode; // Default should be 0 (NONE) in firmware/handler
  debounceMs?: number; // Default should be 0 in firmware/handler
  initialValue?: number; // For outputs; for inputs, it might be last known or not part of config
}

export interface ServoComponentConfig extends BaseComponentConfig {
  componentType: "Servo";
  pin: number;
  minAngle?: number; // Degrees
  maxAngle?: number; // Degrees
  minPulseWidth?: number; // Microseconds, corresponds to firmware
  maxPulseWidth?: number; // Microseconds, corresponds to firmware
  speed?: number; // Speed (e.g., 1-100, or firmware specific units)
  initialAngle?: number; // Optional: angle to set on configuration load
  presets?: number[]; // Array of preset angles
}

export interface StepperComponentConfig extends BaseComponentConfig {
  componentType: "Stepper";
  pulPin: number;
  dirPin: number;
  enaPin?: number; // Optional enable pin
  maxSpeed?: number; // Steps per second
  acceleration?: number; // Steps/sec^2
  stepsPerInch?: number;
  minPosition?: number; // In steps
  maxPosition?: number; // In steps

  // Homing Configuration
  homeSensorId?: string | null; // ID of an IoPin component used as a sensor
  homingDirection?: -1 | 1; // Stepper movement direction for homing
  homingSpeed?: number; // Speed for homing
  homeSensorPinActiveState?: 0 | 1; // Active state of the home sensor (LOW or HIGH)
  homePositionOffset?: number; // Position to set after homing (offset from zero in steps)

  // Jog settings from original ConfiguredComponent
  jogUnit?: "steps" | "inches";
  jogAmount?: number; // For steps if jogUnit is steps
  jogAmountInches?: number; // For inches if jogUnit is inches
}

// Discriminated union for any component configuration
export type AnyComponentConfig =
  | IoPinComponentConfig
  | ServoComponentConfig
  | StepperComponentConfig;
