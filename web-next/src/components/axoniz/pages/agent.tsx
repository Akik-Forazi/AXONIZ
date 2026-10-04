"use client";

import { useState } from "react";
import { Bot, Loader2, Send, CheckCircle2, AlertTriangle, Clock, Cpu, ChevronRight, ListChecks } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";

interface AgentStep {
  id: string;
  title: string;
  status: "queued" | "running" | "complete" | "failed" | "verifying";
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  costUsd?: number;
  result?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface AgentRun {
  goal: string;
  status: "planning" | "executing" | "verifying" | "complete" | "failed";
  startedAt: number;
  steps: AgentStep[];
  totalCost?: number;
  totalLatencyMs?: number;
  report?: string;
}

const SAMPLE_PLAN: Omit<AgentStep, "id" | "status">[] = [
  { title: "Decompose goal into independent subtasks", model: "qwen2.5-coder-7b" },
  { title: "Audit target file (read + AST parse)", model: "qwen2.5-coder-7b" },
  { title: "Identify refactor opportunities via Axodex graph", model: "qwen2.5-coder-7b" },
  { title: "Propose patch with diff", model: "qwen2.5-coder-7b" },
  { title: "Verify: tsc compile + eslint + unit tests", model: "—" },
  { title: "Report findings + apply if verified", model: "qwen2.5-coder-7b" },
];

export function AgentPage() {
  const [goal, setGoal] = useState("");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const { activeProvider, activeModel, providers } = useAxonizStore();
  const cfg = providers[activeProvider];
  const meta = PROVIDER_CATALOG.find((p) => p.id === activeProvider)!;

  async function startGoal() {
    const g = goal.trim();
    if (!g) return;
    setBusy(true);
    const newRun: AgentRun = {
      goal: g,
      status: "planning",
      startedAt: Date.now(),
      steps: SAMPLE_PLAN.map((s, i) => ({
        ...s,
        id: `step-${i}`,
        status: i === 0 ? "running" : "queued",
        startedAt: i === 0 ? Date.now() : undefined,
      })),
    };
    setRun(newRun);

    // Simulate execution — in production this would call /api/axoniz/agent/task
    // and stream progress via SSE.
    for (let i = 0; i < newRun.steps.length; i++) {
      await sleep(900 + Math.random() * 600);
      setRun((prev) => {
        if (!prev) return prev;
        const steps = [...prev.steps];
        steps[i] = {
          ...steps[i],
          status: "verifying",
        };
        return { ...prev, status: "executing", steps };
      });
      await sleep(400 + Math.random() * 400);
      setRun((prev) => {
        if (!prev) return prev;
        const steps = [...prev.steps];
        const tokensIn = Math.floor(200 + Math.random() * 800);
        const tokensOut = Math.floor(50 + Math.random() * 300);
        const latencyMs = Math.floor(800 + Math.random() * 600);
        const costUsd = (tokensIn * meta.pricePerMTokIn + tokensOut * meta.pricePerMTokOut) / 1_000_000;
        steps[i] = {
          ...steps[i],
          status: "complete",
          tokensIn,
          tokensOut,
          latencyMs,
          costUsd: meta.pricePerMTokIn === 0 ? undefined : costUsd,
          finishedAt: Date.now(),
        };
        if (i < steps.length - 1) {
          steps[i + 1].status = "running";
          steps[i + 1].startedAt = Date.now();
        }
        return { ...prev, steps };
      });
    }
    setRun((prev) => prev ? {
      ...prev,
      status: "complete",
      totalCost: prev.steps.reduce((s, st) => s + (st.costUsd ?? 0), 0),
      totalLatencyMs: prev.steps.reduce((s, st) => s + (st.latencyMs ?? 0), 0),
      report: `## Goal\n\n${prev.goal}\n\n## Result\n\nAll 6 steps completed. Verification passed: TypeScript compiled clean, eslint reported 0 errors, all unit tests green.\n\n## Cost\n\nTotal: $${(prev.steps.reduce((s, st) => s + (st.costUsd ?? 0), 0)).toFixed(5)} · ${(prev.steps.reduce((s, st) => s + (st.latencyMs ?? 0), 0) / 1000).toFixed(1)}s wall-clock · ${prev.steps.reduce((s, st) => s + (st.tokensOut ?? 0), 0)} output tokens\n\n## Next\n\nThe refactor is staged on branch \`axoniz/auto-refactor-${Date.now().toString(36)}\`. Review with \`git diff main…HEAD\` and merge if satisfied.`,
    } : prev);
    setBusy(false);
    toast.success("Agent complete", { description: "All steps passed verification." });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between shrink-0 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Bot className="w-3.5 h-3.5" />Agent
        </h2>
        <Badge variant="outline" className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground gap-1.5">
          <Cpu className="w-2.5 h-2.5" />
          {meta.name}
          {activeModel ? ` · ${activeModel}` : ""}
        </Badge>
      </div>

      <div className="p-4 max-w-4xl">
        {/* Goal input */}
        <div className="surface rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Mission Brief
          </div>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe the goal — e.g. audit src/core/auth.ts and propose a refactor with structured error handling"
            className="min-h-[80px] bg-input border-border text-sm"
            disabled={busy}
          />
          <div className="flex items-center justify-between mt-3">
            <div className="text-[10px] text-muted-foreground/70">
              Plan → Execute → Verify → Report · per-step model + cost attribution
            </div>
            <Button onClick={startGoal} disabled={busy || !goal.trim()} size="sm" className="h-8 gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {busy ? "Pursuing" : "Pursue goal"}
            </Button>
          </div>
        </div>

        {/* Run */}
        {run && (
          <div className="mt-4 space-y-3">
            {/* Plan view */}
            <div className="surface rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                <ListChecks className="w-3.5 h-3.5" />
                <h3 className="text-[13px] font-medium">Plan &amp; Execution</h3>
                <Badge variant="outline" className={`ml-auto text-[10px] ${
                  run.status === "complete" ? "border-accent/30 bg-accent/5 text-accent" :
                  run.status === "failed" ? "border-destructive/30 bg-destructive/5 text-destructive" :
                  "border-foreground/20 bg-foreground/5 text-foreground"
                }`}>
                  {run.status}
                </Badge>
              </div>
              <div className="divide-y divide-border">
                {run.steps.map((step, i) => (
                  <StepRow key={step.id} step={step} index={i} />
                ))}
              </div>
              {(run.totalCost !== undefined || run.totalLatencyMs !== undefined) && (
                <div className="px-4 py-2.5 border-t border-border bg-secondary/40 flex items-center gap-4 text-[11px] font-mono">
                  <span className="text-muted-foreground">Total:</span>
                  {run.totalLatencyMs !== undefined && (
                    <span>{(run.totalLatencyMs / 1000).toFixed(1)}s wall</span>
                  )}
                  {run.totalCost !== undefined && run.totalCost > 0 && (
                    <span>${run.totalCost.toFixed(5)}</span>
                  )}
                  {run.steps.reduce((s, st) => s + (st.tokensOut ?? 0), 0) > 0 && (
                    <span className="text-muted-foreground">
                      {run.steps.reduce((s, st) => s + (st.tokensOut ?? 0), 0)} tok out
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Final report */}
            {run.report && (
              <div className="surface rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Final Report
                </div>
                <div className="prose prose-invert max-w-none prose-sm prose-p:my-1.5 prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-1.5 prose-code:bg-secondary prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-foreground">
                  <ReactMarkdown>{run.report}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step, index }: { step: AgentStep; index: number }) {
  const Icon = step.status === "complete" ? CheckCircle2 :
    step.status === "failed" ? AlertTriangle :
    step.status === "verifying" ? Loader2 :
    step.status === "running" ? Loader2 : Clock;
  const spinning = step.status === "running" || step.status === "verifying";

  return (
    <div className="px-4 py-2.5 flex items-start gap-3">
      <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 ${
        step.status === "complete" ? "bg-accent/10" :
        step.status === "failed" ? "bg-destructive/10" :
        step.status === "running" || step.status === "verifying" ? "bg-foreground/10" :
        "bg-secondary"
      }`}>
        <Icon className={`w-3 h-3 ${
          step.status === "complete" ? "text-accent" :
          step.status === "failed" ? "text-destructive" :
          step.status === "running" || step.status === "verifying" ? "text-foreground" :
          "text-muted-foreground"
        } ${spinning ? "animate-spin" : ""}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/60 font-mono">#{index + 1}</span>
          <span className="text-[13px] text-foreground/90">{step.title}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground/70 font-mono">
          {step.model && <span>model: {step.model}</span>}
          {step.latencyMs && <span>{step.latencyMs}ms</span>}
          {step.tokensOut && <span>{step.tokensOut} tok out</span>}
          {step.costUsd !== undefined && step.costUsd > 0 && <span>${step.costUsd.toFixed(5)}</span>}
          {step.status === "verifying" && <span className="text-foreground">verifying…</span>}
        </div>
      </div>
      <ChevronRight className="w-3 h-3 text-muted-foreground/30 mt-1" />
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
