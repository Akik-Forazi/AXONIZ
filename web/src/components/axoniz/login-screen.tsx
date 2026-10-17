"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { axonizClient } from "@/lib/axoniz/client";
import { useAxonizStore } from "@/stores/axoniz-store";

/**
 * AXONIZ login screen.
 *
 * Auth is the AXONIZ backend's responsibility — `src/web/server.ts` uses
 * `getAuth()` + bcrypt + JWT. The UI just sends credentials through the
 * proxy route `/api/axoniz/auth/login`, which forwards to the real
 * backend when it's running.
 *
 * In preview / dev without the backend, the proxy returns a clearly-tagged
 * mock token (any non-empty password works) so the UI stays demoable.
 * The connection pill in the top bar always shows LIVE or MOCK so the
 * source is never ambiguous.
 *
 * To set up real authentication:
 *   1. Run `axoniz --web` — this starts the Express backend on :7860
 *      with the real bcrypt + JWT auth.
 *   2. Configure the first operator via the AXONIZ CLI (`axoniz user create`).
 *   3. Open this UI — login now goes through to the real backend.
 */
export function LoginScreen() {
  const [username, setUsername] = useState("axoniz");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAxonizStore((s) => s.setAuth);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!username || password.length < 4) {
      setError("Username and a password (min 4 chars) are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await axonizClient.login({ username, password });
      if ("error" in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setAuth(res.token, res.username);
      toast.success(`Welcome, ${res.username}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Wordmark */}
        <div className="mb-7 text-center">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-md bg-foreground/8 border border-foreground/15 flex items-center justify-center">
              <span className="text-foreground font-mono text-xs font-semibold tracking-tighter">AX</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">AXONIZ</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Autonomous local agentic system
          </p>
        </div>

        {/* Login card */}
        <form onSubmit={onSubmit} className="surface rounded-lg p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              className="h-9 bg-input border-border text-sm"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-9 bg-input border-border text-sm"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-9 text-sm font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground/60 text-center mt-5 leading-relaxed">
          Auth is handled by the AXONIZ backend (bcrypt + JWT).
          <br />
          Without the backend running, the proxy uses a clearly-tagged mock.
        </p>
      </div>
    </div>
  );
}
