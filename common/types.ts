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
}
