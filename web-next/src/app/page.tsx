"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";
import { LoginScreen } from "@/components/axoniz/login-screen";

export default function Home() {
  const token = useAxonizStore((s) => s.token);
  const router = useRouter();

  useEffect(() => {
    if (token) router.replace("/chat");
  }, [token, router]);

  if (!token) return <LoginScreen />;
  return null;
}
