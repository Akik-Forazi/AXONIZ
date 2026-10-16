"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root entry — LOCAL-FIRST, no login.
 *
 * Always redirect to /chat. No token check, no login screen.
 * The dashboard is directly accessible.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/chat");
  }, [router]);

  return null;
}
