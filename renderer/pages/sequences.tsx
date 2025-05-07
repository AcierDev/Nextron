import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Plus, PlayCircle, Edit, Trash2 } from "lucide-react";

// Types
interface Sequence {
  id: string;
  name: string;
  description: string;
  stepsCount: number;
  createdAt: string;
  updatedAt: string;
}

// Mock data for demo purposes
const mockSequences: Sequence[] = [
  {
    id: "seq-1",
    name: "Simple Movement Pattern",
    description: "A basic sequence for testing motor movements",
    stepsCount: 8,
    createdAt: "2023-08-15T10:30:00Z",
    updatedAt: "2023-08-16T14:45:00Z",
  },
  {
    id: "seq-2",
    name: "Calibration Routine",
    description: "Sequence to calibrate all motors",
    stepsCount: 12,
    createdAt: "2023-09-01T08:20:00Z",
    updatedAt: "2023-09-01T09:15:00Z",
  },
];

// Dynamically import the SequencePage component to avoid SSR issues
const SequencePage = dynamic(
  () => import("@/components/sequence-recorder/sequence-page"),
  { ssr: false }
);

export default function SequencesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configId = searchParams.get("config");
  const sequenceId = searchParams.get("id");

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load sequences (mock data for now)
  useEffect(() => {
    // In a real app, this would fetch from an API or IPC
    setSequences(mockSequences);
    setIsLoading(false);
  }, []);

  // If sequence ID is provided, show the sequence editor
  if (sequenceId) {
    return <SequencePage />;
  }

  // Otherwise show the sequences list
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <Head>
        <title>Sequences | Everwood CNC</title>
      </Head>

      <div className="container mx-auto p-4 md:p-6">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push(`/dashboard?config=${configId}`)}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Sequences
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Create and manage motor sequences
              </p>
            </div>
          </div>

          <Button
            onClick={() =>
              router.push(`/sequences?config=${configId}&id=new-sequence`)
            }
            className="flex items-center gap-2 bg-blue-600/90 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" />
            New Sequence
          </Button>
        </header>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              Loading sequences...
            </p>
          </div>
        ) : sequences.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
              No Sequences Created
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Create your first sequence to automate your CNC operations
            </p>
            <Button
              onClick={() =>
                router.push(`/sequences?config=${configId}&id=new-sequence`)
              }
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Sequence
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sequences.map((sequence) => (
              <Card
                key={sequence.id}
                className="p-4 backdrop-blur-sm bg-white/70 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50"
              >
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1">
                      {sequence.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {sequence.description}
                    </p>
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                      <span>{sequence.stepsCount} steps</span>
                      <span className="mx-2">•</span>
                      <span>
                        Updated{" "}
                        {new Date(sequence.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() =>
                        router.push(
                          `/sequences?config=${configId}&id=${sequence.id}`
                        )
                      }
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 border-red-200 hover:border-red-300 hover:text-red-600"
                        onClick={() => {
                          // In a real app, this would confirm and delete
                          alert("Sequence deletion would happen here");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => {
                          // In a real app, this would start sequence playback
                          alert("Sequence playback would start here");
                        }}
                      >
                        <PlayCircle className="h-3.5 w-3.5 mr-1" />
                        Run
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
