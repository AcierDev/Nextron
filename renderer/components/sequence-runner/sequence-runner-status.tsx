import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, StopCircle, FastForward, Rewind } from "lucide-react";
import { useSequenceRunner } from "@/hooks/use-sequence-runner";

interface SequenceRunnerStatusProps {
  className?: string;
}

export function SequenceRunnerStatus({ className }: SequenceRunnerStatusProps) {
  const {
    isRunning,
    isPaused,
    currentStepIndex,
    totalSteps,
    sequenceName,
    speedMultiplier,
    pauseSequence,
    resumeSequence,
    stopSequence,
    setPlaybackSpeed,
  } = useSequenceRunner();

  // If no sequence is running, don't display anything
  if (!isRunning) {
    return null;
  }

  // Calculate progress percentage
  const progress = totalSteps > 0 ? (currentStepIndex / totalSteps) * 100 : 0;

  return (
    <Card className={`${className} border-warning/50`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex justify-between items-center">
          <span className="flex-1">Running: {sequenceName || "Sequence"}</span>
          <span className="text-xs text-muted-foreground">
            Step {currentStepIndex + 1} of {totalSteps}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={progress} className="h-2" />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => stopSequence()}
              title="Stop Sequence"
              className="h-8 w-8"
            >
              <StopCircle className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant={isPaused ? "default" : "outline"}
              size="icon"
              onClick={() => (isPaused ? resumeSequence() : pauseSequence())}
              title={isPaused ? "Resume Sequence" : "Pause Sequence"}
              className="h-8 w-8"
            >
              {isPaused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() =>
                setPlaybackSpeed(Math.max(0.25, speedMultiplier - 0.25))
              }
              disabled={speedMultiplier <= 0.25}
              aria-label="Decrease speed"
            >
              <Rewind className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Slider
              value={[speedMultiplier]}
              min={0.25}
              max={2}
              step={0.25}
              onValueChange={(value) => setPlaybackSpeed(value[0])}
              className="w-16 h-1.5"
              aria-label="Playback speed"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() =>
                setPlaybackSpeed(Math.min(2, speedMultiplier + 0.25))
              }
              disabled={speedMultiplier >= 2}
              aria-label="Increase speed"
            >
              <FastForward className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <span className="text-xs font-medium w-8 text-right tabular-nums text-muted-foreground">
              {speedMultiplier.toFixed(2)}x
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
