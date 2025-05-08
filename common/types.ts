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
  // Stepper specific
  maxSpeed?: number;
  acceleration?: number;
  stepsPerInch?: number; // Added
  minPosition?: number; // Added
  maxPosition?: number; // Added
  jogUnit?: "steps" | "inches"; // Added
  jogAmount?: number; // Added - for steps
  jogAmountInches?: number; // Added - for inches
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
