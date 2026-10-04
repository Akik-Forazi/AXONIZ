"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { axonizClient } from "@/lib/axoniz/client";
import { useAxonizStore } from "@/stores/axoniz-store";

export function LoginScreen() {
  const [username, setUsername] = useState("axoniz");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAxonizStore((s) => s.setAuth);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username || password.length < 4) {
      toast.error("Enter a username and a password (min 4 characters).");
      return;
    }
    setLoading(true);
    try {
      const res = await axonizClient.login({ username, password });
      if ("error" in res) {
        toast.error(res.error);
        setLoading(false);
        return;
      }
      setAuth(res.token, res.username);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Wordmark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
              <span className="text-primary font-mono text-xs font-semibold tracking-tighter">AX</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">AXONIZ</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Autonomous local agentic system
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={onSubmit}
          className="surface rounded-lg p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              className="h-9 bg-input border-border"
              disabled={loading}
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
              className="h-9 bg-input border-border"
              placeholder="••••••••"
              disabled={loading}
              autoFocus
            />
          </div>

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
          Preview accepts any non-empty credentials.
          <br />
          When paired with <code className="font-mono text-muted-foreground/80">axoniz --web</code>,
          real JWT auth is enforced.
        </p>
      </div>
    </div>
  );
}
