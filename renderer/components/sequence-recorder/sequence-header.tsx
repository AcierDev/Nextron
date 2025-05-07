"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Edit2, Check } from "lucide-react";
import type { Sequence } from "./sequence-page";

interface SequenceHeaderProps {
  sequence: Sequence;
  updateSequence: (data: Partial<Sequence>) => void;
  onSave: () => void;
  onBack: () => void;
}

export function SequenceHeader({
  sequence,
  updateSequence,
  onSave,
  onBack,
}: SequenceHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(sequence.name);
  const [editDescription, setEditDescription] = useState(sequence.description);

  const handleSaveEdit = () => {
    updateSequence({
      name: editName,
      description: editDescription,
    });
    setIsEditing(false);
  };

  return (
    <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {isEditing ? (
          <div className="flex-1 space-y-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-xl font-bold bg-white/80 dark:bg-gray-800/80 border-gray-300/50 dark:border-gray-600/50"
            />
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="text-sm text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 border-gray-300/50 dark:border-gray-600/50 min-h-[60px]"
              placeholder="Describe your sequence..."
            />
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {sequence.name}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                className="h-6 w-6 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {sequence.description}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <Button onClick={handleSaveEdit} className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            Apply Changes
          </Button>
        ) : (
          <Button
            onClick={onSave}
            className="flex items-center gap-2 bg-blue-600/90 hover:bg-blue-700 text-white"
          >
            <Save className="h-4 w-4" />
            Save Sequence
          </Button>
        )}
      </div>
    </header>
  );
}
