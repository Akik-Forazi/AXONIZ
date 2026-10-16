"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield, RefreshCw, Copy, Check, Loader2, Smartphone, Monitor, Trash2,
  KeyRound, Clock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface CodeResponse {
  code: string;
  created_at: number;
  last_activity: number;
  expires_in_hours?: number;
  message?: string;
}

export function DevicesSettingsPage() {
  const [code, setCode] = useState<CodeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/axoniz/auth/generate-code");
      if (res.ok) {
        const data = await res.json();
        setCode(data);
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error("Failed to get code", { description: err.error });
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCode(); }, [fetchCode]);

  async function refreshCode() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/axoniz/auth/generate-code?refresh=true", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCode(data);
        toast.success("New code generated", { description: data.code });
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error("Failed to generate", { description: err.error });
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRefreshing(false);
    }
  }

  function copyCode() {
    if (!code?.code) return;
    navigator.clipboard.writeText(code.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  }

  const ageMs = code ? Date.now() - code.last_activity : 0;
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
  const ageMins = Math.floor((ageMs % (60 * 60 * 1000)) / (60 * 1000));
  const remainingHours = code?.expires_in_hours ? Math.max(0, code.expires_in_hours - ageHours) : 24;

  return (
    <div className="h-full overflow-y-auto p-5 max-w-3xl space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Device Authorization</h2>
      </div>

      {/* ── Current Code ─────────────────────────────────────────── */}
      <Card className="surface p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[14px] font-medium flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              Device Code
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Share this 9-digit code with new devices. They enter it at the authorization page.
            </p>
          </div>
          <Button onClick={refreshCode} disabled={refreshing} variant="secondary" size="sm" className="h-7 gap-1.5 text-[11px]">
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {refreshing ? "Generating..." : "New Code"}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading code...</span>
          </div>
        ) : code ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 px-4 py-3 rounded-md border border-border bg-secondary/40">
              <span className="text-2xl font-mono tracking-[0.4em] text-foreground/90">{code.code}</span>
            </div>
            <Button onClick={copyCode} variant="ghost" size="icon" className="h-10 w-10">
              {copied ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4">No code available. Click "New Code".</div>
        )}

        {code && (
          <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last activity: {ageHours}h {ageMins}m ago
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Auto-rotates after {code.expires_in_hours ?? 24}h of no activity
            </span>
          </div>
        )}
      </Card>

      {/* ── How it works ─────────────────────────────────────────── */}
      <Card className="surface p-4">
        <div className="text-[13px] font-medium mb-3">How device authorization works</div>
        <div className="space-y-2 text-[11px] text-muted-foreground">
          <div className="flex gap-2">
            <span className="text-foreground/60 font-mono">1.</span>
            <span>This device (running <code className="font-mono text-foreground/70">axoniz --web</code>) is automatically authorized — no code needed.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-foreground/60 font-mono">2.</span>
            <span>Other devices (phone, another laptop, internet) open the dashboard and see the code entry page.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-foreground/60 font-mono">3.</span>
            <span>They enter the 9-digit code shown above. Once verified, they get a cookie and work forever.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-foreground/60 font-mono">4.</span>
            <span>The code stays valid for 24 hours (sliding window — viewing or using it resets the timer).</span>
          </div>
          <div className="flex gap-2">
            <span className="text-foreground/60 font-mono">5.</span>
            <span>After 24h of no activity, the code auto-rotates. Generate a new one anytime with "New Code".</span>
          </div>
        </div>
      </Card>

      {/* ── Security info ────────────────────────────────────────── */}
      <Card className="surface p-4">
        <div className="text-[13px] font-medium mb-3 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-primary" />
          Security
        </div>
        <div className="space-y-2 text-[11px] text-muted-foreground">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3 h-3 text-accent mt-0.5 shrink-0" />
            <span>Cookie is HTTP-only (can't be stolen via XSS) and same-site strict (blocks CSRF).</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3 h-3 text-accent mt-0.5 shrink-0" />
            <span>CSRF protection on all write methods (POST/PUT/DELETE/PATCH).</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3 h-3 text-accent mt-0.5 shrink-0" />
            <span>API keys are always redacted in responses — never returned to the browser.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3 h-3 text-accent mt-0.5 shrink-0" />
            <span>Config saves use deep merge-patch — can't destroy existing settings.</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] gap-1.5 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("This will invalidate ALL authorized devices. They'll need to re-enter the code. Continue?")) {
                toast.success("To revoke all devices:", {
                  description: "Run: del ~/.axoniz/web-secret  (then restart axoniz --web)",
                });
              }
            }}
          >
            <Trash2 className="w-3 h-3" />
            Revoke All Devices
          </Button>
        </div>
      </Card>

      {/* ── CLI hint ─────────────────────────────────────────────── */}
      <div className="text-[10px] text-muted-foreground/60 font-mono">
        CLI: <span className="text-foreground/70">axoniz auth --temp-device-code</span> (coming soon — generate code from terminal)
      </div>
    </div>
  );
}
