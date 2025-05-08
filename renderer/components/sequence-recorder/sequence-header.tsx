"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Edit2, Check } from "lucide-react";

interface SequenceHeaderProps {
  sequenceName: string;
  sequenceDescription: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onBack?: () => void;
}

export function SequenceHeader({
  sequenceName,
  sequenceDescription,
  onNameChange,
  onDescriptionChange,
  onBack,
}: SequenceHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(sequenceName);
  const [editDescription, setEditDescription] = useState(sequenceDescription);

  useEffect(() => {
    setEditName(sequenceName);
  }, [sequenceName]);

  useEffect(() => {
    setEditDescription(sequenceDescription);
  }, [sequenceDescription]);

  const handleApplyChanges = () => {
    onNameChange(editName);
    onDescriptionChange(editDescription);
    setIsEditing(false);
  };

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      console.warn("SequenceHeader: onBack prop not provided.");
    }
  };

  return (
    <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
      <div className="flex items-center gap-2 flex-grow">
        {onBack && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleBackClick}
            className="shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {isEditing ? (
          <div className="flex-1 space-y-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Sequence Name"
              className="text-xl font-bold bg-background border-border"
            />
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Sequence Description..."
              className="text-sm text-muted-foreground bg-background border-border min-h-[60px]"
            />
          </div>
        ) : (
          <div
            className="flex-grow cursor-pointer group"
            onClick={() => setIsEditing(true)}
            title="Click to edit"
          >
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {sequenceName || "Untitled Sequence"}
              </h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Edit name and description"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              {sequenceDescription || "No description."}
            </p>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
          <Button
            onClick={handleApplyChanges}
            className="flex items-center gap-2"
            size="sm"
          >
            <Check className="h-4 w-4" />
            Apply
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setIsEditing(false);
              setEditName(sequenceName);
              setEditDescription(sequenceDescription);
            }}
            size="sm"
          >
            Cancel
          </Button>
        </div>
      )}
    </header>
  );
}
