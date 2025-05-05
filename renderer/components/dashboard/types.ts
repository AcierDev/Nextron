export type ComponentGroup =
  | "servos"
  | "sensors"
  | "io"
  | "relays"
  | "steppers";
export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

// State for the configuration modal form
export interface NewComponentFormState {
  name: string;
  type: string;
  pin: string;
  pulPin: string;
  dirPin: string;
  enaPin: string;
  pins: string;
  pullMode: "none" | "pullup" | "pulldown" | null;
}
