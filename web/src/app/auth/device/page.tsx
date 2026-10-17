"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function DeviceCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 9 || !/^\d{9}$/.test(code)) {
      setError("Enter the 9-digit code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/axoniz/auth/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.push("/chat");
        return;
      }
      const data = await res.json().catch(() => ({ error: "Failed" }));
      setError(data.error || "Invalid or expired code");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-md bg-foreground/8 border border-foreground/15 flex items-center justify-center">
              <Shield className="w-4 h-4 text-foreground/60" />
            </div>
            <span className="text-lg font-semibold tracking-tight">AXONIZ</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Device Authorization</h1>
          <p className="text-sm text-muted-foreground">
            This device isn&apos;t recognized. Enter the 9-digit code shown on the AXONIZ server terminal or dashboard.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input
            type="text"
            inputMode="numeric"
            pattern="\d{9}"
            maxLength={9}
            placeholder="000000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-2xl font-mono tracking-[0.5em] h-14 bg-input border-border"
            autoFocus
            autoComplete="off"
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button type="submit" disabled={loading || code.length !== 9} className="w-full h-11 gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {loading ? "Verifying..." : "Authorize Device"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground/60">
            The code expires after 5 minutes.<br />
            Generate a new one with: <code className="font-mono text-foreground/70">axoniz auth --temp-device-code</code>
          </p>
        </div>
      </div>
    </div>
  );
}
