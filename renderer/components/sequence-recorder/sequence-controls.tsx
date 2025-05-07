"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  RepeatIcon as Record,
  Play,
  Pause,
  StopCircle,
  FastForward,
  Rewind,
} from "lucide-react";
import { formatTime } from "@/components/sequence-recorder/utils";

interface SequenceControlsProps {
  isRecording: boolean;
  isPlaying: boolean;
  playbackSpeed: number;
  onToggleRecording: () => void;
  onTogglePlayback: () => void;
  onStopPlayback: () => void;
  onChangeSpeed: (speed: number) => void;
  sequenceLength: number;
  currentTime: number;
}

export function SequenceControls({
  isRecording,
  isPlaying,
  playbackSpeed,
  onToggleRecording,
  onTogglePlayback,
  onStopPlayback,
  onChangeSpeed,
  sequenceLength,
  currentTime,
}: SequenceControlsProps) {
  const [progress, setProgress] = useState(0);
  const [displayTime, setDisplayTime] = useState("00:00.000");
  const [totalTime, setTotalTime] = useState("00:00.000");

  useEffect(() => {
    setTotalTime(formatTime(sequenceLength));
  }, [sequenceLength]);

  useEffect(() => {
    setDisplayTime(formatTime(currentTime));
    setProgress(sequenceLength > 0 ? (currentTime / sequenceLength) * 100 : 0);
  }, [currentTime, sequenceLength]);

  return (
    <div className="backdrop-blur-md bg-white/70 dark:bg-gray-800/50 rounded-xl border border-white/20 dark:border-gray-700/30 shadow-lg p-4">
      <div className="flex flex-col space-y-4">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{displayTime}</span>
            <span>{totalTime}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={onToggleRecording}
              disabled={isPlaying}
              className={`h-10 w-10 ${
                isRecording
                  ? "animate-pulse bg-red-500 text-white hover:bg-red-600"
                  : "text-red-500 border-red-200 hover:border-red-300 hover:text-red-600"
              }`}
            >
              <Record className="h-5 w-5" />
            </Button>

            <div className="flex items-center">
              <Button
                variant="outline"
                size="icon"
                onClick={onStopPlayback}
                disabled={!isPlaying}
                className="h-8 w-8 text-gray-700 dark:text-gray-300"
              >
                <StopCircle className="h-4 w-4" />
              </Button>

              <Button
                variant={isPlaying ? "default" : "outline"}
                size="icon"
                onClick={onTogglePlayback}
                disabled={isRecording}
                className={`h-10 w-10 ml-2 ${
                  isPlaying
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "text-green-500 border-green-200 hover:border-green-300 hover:text-green-600"
                }`}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Speed:
            </span>
            <div className="flex items-center gap-2">
              <Rewind className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Slider
                value={[playbackSpeed]}
                min={0.25}
                max={2}
                step={0.25}
                onValueChange={(value) => onChangeSpeed(value[0])}
                className="w-24"
              />
              <FastForward className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <span className="text-sm font-medium w-10">{playbackSpeed}x</span>
          </div>
        </div>
      </div>
    </div>
  );
}
