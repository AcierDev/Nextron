// Export the combined config store and its types
import useConfigStore, {
  StepperMotorDisplay,
  ServoMotorDisplay,
  IOPinDisplay,
  ComponentDisplay,
  ComponentStates,
  ConnectionStatus,
  ConfigListItem,
} from "./configStore";

// Export WebSocket store
import useWSStore from "./wsStore";

export {
  useConfigStore,
  useWSStore,
  // Types
  StepperMotorDisplay,
  ServoMotorDisplay,
  IOPinDisplay,
  ComponentDisplay,
  ComponentStates,
  ConnectionStatus,
  ConfigListItem,
};
