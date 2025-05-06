"use client"; // Ensure this is a client component for useRouter

import React, { useEffect } from "react";
import { useRouter } from "next/navigation"; // Import useRouter

// Basic Loading Component
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
    <p className="text-gray-600 dark:text-gray-300 text-lg">Redirecting...</p>
    {/* You could add a spinner here */}
  </div>
);

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the firmware page first
    router.replace("/firmware-setup");
  }, [router]);

  // Render a loading/redirecting state while the redirect happens
  return <LoadingFallback />;
}
