"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the connection page instead of configurations
    router.push("/connection");
  }, [router]);

  return null;
}
