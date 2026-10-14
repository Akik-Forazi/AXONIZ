"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";
import { LoginScreen } from "@/components/axoniz/login-screen";

/**
 * Root entry. If the user is authenticated, redirect to /chat.
 *
 * The redirect is keyed by the active token value, not by a single-shot
 * boolean ref. That way:
 *   - If `router` reference changes (HMR, dev route transitions), the
 *     effect re-fires but `router.replace("/chat")` is a no-op when
 *     already on /chat — no bounce.
 *   - If the user logs out and logs back in with a NEW token, the
 *     remembered token no longer matches, so the redirect fires again
 *     (instead of being suppressed by a stale boolean ref).
 *   - If the same token somehow re-enters the component (e.g. bfcache
 *     restore), the redirect is skipped because the remembered token
 *     still matches.
 */
export default function Home() {
  const token = useAxonizStore((s) => s.token);
  const router = useRouter();
  const redirectedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      // Reset so a fresh login redirects again.
      redirectedForRef.current = null;
      return;
    }
    if (redirectedForRef.current === token) return;
    redirectedForRef.current = token;
    router.replace("/chat");
  }, [token, router]);

  if (!token) return <LoginScreen />;
  return null;
}
