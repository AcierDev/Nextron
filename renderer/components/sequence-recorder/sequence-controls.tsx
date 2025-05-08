"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  RepeatIcon as RecordIcon,
  Play,
  Pause,
  StopCircle,
  FastForward,
  Rewind,
  Save,
  PlusCircle,
  Loader2 as Spinner,
} from "lucide-react";

interface SequenceControlsProps {
  onSave: () => Promise<void>;
  isSaving?: boolean;
  canSave?: boolean;
  onAddStep: () => void;
  isRecording: boolean;
  isPlaying: boolean;
  playbackSpeed: number;
  onToggleRecording: () => void;
  onTogglePlayback: () => void;
  onStopPlayback: () => void;
  onPlaybackSpeedChange: (speed: number) => void;
  hasSteps?: boolean;
}

export function SequenceControls({
  onSave,
  isSaving,
  canSave,
  onAddStep,
  isRecording,
  isPlaying,
  playbackSpeed,
  onToggleRecording,
  onTogglePlayback,
  onStopPlayback,
  onPlaybackSpeedChange,
  hasSteps,
}: SequenceControlsProps) {
  return (
    <div className="p-4 bg-card rounded-lg border space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          onClick={onAddStep}
          variant="outline"
          className="flex-1"
          disabled={isSaving || isRecording || isPlaying}
        >
          <PlusCircle className="w-4 h-4 mr-2" /> Add Step
        </Button>
        <Button
          onClick={onSave}
          disabled={!canSave || isSaving || isRecording || isPlaying}
          className="flex-1"
        >
          {isSaving ? (
            <Spinner className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isSaving ? "Saving..." : "Save Sequence"}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            onClick={onToggleRecording}
            disabled={isPlaying || isSaving}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            className={`h-9 w-9 ${
              isRecording
                ? "animate-pulse ring-2 ring-red-500 ring-offset-2 ring-offset-background"
                : ""
            }`}
          >
            <RecordIcon className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={onStopPlayback}
            disabled={!isPlaying || isSaving}
            title="Stop Playback"
            className="h-9 w-9"
          >
            <StopCircle className="h-4 w-4" />
          </Button>

          <Button
            variant={isPlaying ? "default" : "outline"}
            size="icon"
            onClick={onTogglePlayback}
            disabled={isRecording || !hasSteps || isSaving}
            title={isPlaying ? "Pause Playback" : "Play Sequence"}
            className="h-9 w-9"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              onPlaybackSpeedChange(Math.max(0.25, playbackSpeed - 0.25))
            }
            disabled={isSaving || isRecording}
            aria-label="Decrease speed"
          >
            <Rewind className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Slider
            value={[playbackSpeed]}
            min={0.25}
            max={2}
            step={0.25}
            onValueChange={(value) => onPlaybackSpeedChange(value[0])}
            className="w-20 h-2"
            disabled={isSaving || isRecording}
            aria-label="Playback speed"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              onPlaybackSpeedChange(Math.min(2, playbackSpeed + 0.25))
            }
            disabled={isSaving || isRecording}
            aria-label="Increase speed"
          >
            <FastForward className="h-4 w-4 text-muted-foreground" />
          </Button>
          <span className="text-xs font-medium w-8 text-right tabular-nums text-muted-foreground">
            {playbackSpeed.toFixed(2)}x
          </span>
        </div>
      </div>
    </div>
  );
}
