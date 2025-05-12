"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SequenceStep, DeviceDisplay } from "../../../common/types";
import { formatTime } from "./utils";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Edit2,
  Trash2,
  ChevronUp,
  ChevronDown,
  TimerIcon,
  ZapIcon,
  Plus,
} from "lucide-react";

interface SequenceTimelineProps {
  steps: SequenceStep[];
  devices: DeviceDisplay[];
  onStepSelect?: (stepId: string) => void;
  onUpdateStep?: (stepId: string, data: Partial<SequenceStep>) => void;
  onDeleteStep?: (stepId: string) => void;
  onReorderSteps?: (steps: SequenceStep[]) => void;
  onEditStep?: (step: SequenceStep) => void;
  onMoveStepUp?: (stepId: string) => void;
  onMoveStepDown?: (stepId: string) => void;
  onAddStep?: () => void;
  onAddDelay?: (atIndex?: number) => void;
}

export function SequenceTimeline({
  steps,
  devices,
  onStepSelect,
  onUpdateStep,
  onDeleteStep,
  onReorderSteps,
  onEditStep,
  onMoveStepUp,
  onMoveStepDown,
  onAddStep,
  onAddDelay,
}: SequenceTimelineProps) {
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [hoveredGapIndex, setHoveredGapIndex] = useState<number | null>(null);

  // Debounce timer for gap hover
  const gapHoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMouseOverGapRef = useRef<boolean>(false);
  const activeGapIndexRef = useRef<number | null>(null);

  // Clean up any timers when component unmounts
  useEffect(() => {
    return () => {
      if (gapHoverTimerRef.current) {
        clearTimeout(gapHoverTimerRef.current);
      }
    };
  }, []);

  const handleGapMouseEnter = useCallback((index: number) => {
    isMouseOverGapRef.current = true;
    activeGapIndexRef.current = index;

    // Clear any existing timer
    if (gapHoverTimerRef.current) {
      clearTimeout(gapHoverTimerRef.current);
    }

    // Set a small delay before showing the gap UI
    gapHoverTimerRef.current = setTimeout(() => {
      if (isMouseOverGapRef.current && activeGapIndexRef.current === index) {
        setHoveredGapIndex(index);
      }
    }, 150);
  }, []);

  const handleGapMouseLeave = useCallback(() => {
    isMouseOverGapRef.current = false;

    // Clear any existing timer
    if (gapHoverTimerRef.current) {
      clearTimeout(gapHoverTimerRef.current);
    }

    // Set a small delay before hiding the gap UI to prevent flickering
    gapHoverTimerRef.current = setTimeout(() => {
      if (!isMouseOverGapRef.current) {
        setHoveredGapIndex(null);
      }
    }, 250);
  }, []);

  const getDeviceDetails = (deviceId: string): DeviceDisplay | undefined => {
    return devices.find((d) => d.id === deviceId);
  };

  const getStepTitle = (step: SequenceStep): string => {
    if (step.type === "action") {
      const device = getDeviceDetails(step.deviceId);
      return `${device?.name || "Unknown Device"}: ${step.action}`;
    }
    return "Delay";
  };

  const getStepDescription = (step: SequenceStep): string => {
    if (step.type === "action") {
      let description = `Value: ${step.value}`;
      if (step.speed) description += `, Speed: ${step.speed}`;
      if (step.acceleration) description += `, Accel: ${step.acceleration}`;
      return description;
    }
    return `Wait for ${formatTime(step.duration)}`;
  };

  const getStepIcon = (step: SequenceStep) => {
    if (step.type === "delay")
      return <TimerIcon className="h-5 w-5 text-orange-500" />;
    if (step.type === "action") {
      return <ZapIcon className="h-5 w-5 text-blue-500" />;
    }
    return <ZapIcon className="h-5 w-5 text-gray-500" />;
  };

  // Calculate if a step should have extra margin based on hovering
  const getStepMargin = useCallback(
    (index: number) => {
      if (hoveredGapIndex === null) return "";

      // Add margin to the step above the hovered gap
      if (index === hoveredGapIndex - 1) return "mb-12";

      // Add margin to the step below the hovered gap
      if (index === hoveredGapIndex) return "mt-12";

      return "";
    },
    [hoveredGapIndex]
  );

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No steps in the sequence. Add actions or delays.</p>
        {onAddStep && (
          <Button
            variant="ghost"
            onClick={onAddStep}
            className="mt-4 border border-dashed border-muted-foreground/50 hover:border-muted-foreground"
          >
            <Plus className="h-4 w-4 mr-2" /> Add first step
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-1 relative">
      <LayoutGroup>
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            className="relative pb-5"
            layout
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
              mass: 0.8,
            }}
          >
            {/* Step Item */}
            <motion.div
              className={`flex items-center gap-3 p-3 rounded-lg border bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer relative group ${getStepMargin(
                index
              )}`}
              onMouseEnter={() => setHoveredStepId(step.id)}
              onMouseLeave={() => setHoveredStepId(null)}
              onClick={() => onEditStep && onEditStep(step)}
              layout="position"
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
              }}
            >
              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted">
                {getStepIcon(step)}
              </div>
              <div className="flex-grow min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {getStepTitle(step)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {getStepDescription(step)}
                </p>
              </div>

              {/* Control buttons - only visible on hover */}
              <div
                className={`flex items-center gap-1 flex-shrink-0 transition-opacity duration-200 ${
                  hoveredStepId === step.id ? "opacity-100" : "opacity-0"
                }`}
              >
                {onMoveStepUp && index > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveStepUp(step.id);
                    }}
                    title="Move Up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                )}

                {onMoveStepDown && index < steps.length - 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveStepDown(step.id);
                    }}
                    title="Move Down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                )}

                {onDeleteStep && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive/90"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteStep(step.id);
                    }}
                    title="Delete Step"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </motion.div>

            {/* Gap between steps with "Add Delay" button - improved hit area and stability */}
            {index < steps.length - 1 && onAddDelay && (
              <div
                className="absolute left-0 right-0 z-10 h-16 -mt-4 flex items-center justify-center"
                onMouseEnter={() => handleGapMouseEnter(index + 1)}
                onMouseLeave={handleGapMouseLeave}
              >
                <AnimatePresence mode="wait">
                  {hoveredGapIndex === index + 1 && (
                    <motion.div
                      className="absolute inset-x-0 h-12 top-1/2 -translate-y-1/2 flex items-center justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <motion.div
                        className="absolute inset-0 bg-primary/5 rounded-md border-y border-primary/10"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      />
                      <motion.div
                        className="flex items-center justify-center w-full z-10 pointer-events-auto"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{
                          duration: 0.15,
                          ease: "easeOut",
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full px-3 py-0 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted hover:border-muted-foreground bg-card/90 backdrop-blur-sm shadow-sm hover:bg-card"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddDelay(index + 1);
                            setHoveredGapIndex(null);
                          }}
                        >
                          <TimerIcon className="h-3.5 w-3.5 mr-1" />
                          Add Delay
                        </Button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        ))}

        {/* Add Delay button at the end - improved stability */}
        {steps.length > 0 && onAddDelay && (
          <div
            className="relative h-16 mt-2 cursor-pointer"
            onMouseEnter={() => handleGapMouseEnter(steps.length)}
            onMouseLeave={handleGapMouseLeave}
          >
            <AnimatePresence mode="wait">
              {hoveredGapIndex === steps.length && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-primary/5 rounded-md border-y border-primary/10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  />
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center w-full z-10 pointer-events-auto"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      duration: 0.15,
                      ease: "easeOut",
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3 py-0 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted hover:border-muted-foreground bg-card/90 backdrop-blur-sm shadow-sm hover:bg-card"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddDelay(steps.length);
                        setHoveredGapIndex(null);
                      }}
                    >
                      <TimerIcon className="h-3.5 w-3.5 mr-1" />
                      Add Delay
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Add Step Button that looks like a step */}
        {onAddStep && (
          <motion.div
            className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-background hover:bg-muted/30 hover:border-muted-foreground/50 transition-all cursor-pointer mt-4"
            onClick={onAddStep}
            layout
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
            }}
          >
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted/50">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-sm font-medium text-muted-foreground truncate">
                Add step
              </p>
              <p className="text-xs text-muted-foreground/70 truncate">
                Click to add a new action or delay
              </p>
            </div>
          </motion.div>
        )}
      </LayoutGroup>
    </div>
  );
}
