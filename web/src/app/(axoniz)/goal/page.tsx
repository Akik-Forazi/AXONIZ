"use client";

import { useState } from "react";
import { Bot, Play, RotateCcw, CheckCircle2, Circle, AlertCircle, Loader2 } from "lucide-react";
import { PageHeader, GlassCard, StatusPill, EmptyState } from "@/components/axoniz/page-primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StepStatus = "queued" | "running" | "verifying" | "complete" | "failed";

interface Step {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  costUsd?: number;
}

const DEFAULT_STEPS: Step[] = [
  { id: "decompose", title: "Decompose Goal", status: "queued", detail: "Break the high-level goal into discrete subtasks." },
  { id: "audit", title: "Audit Workspace", status: "queued", detail: "Scan files, structure, dependencies, and recent changes." },
  { id: "graph", title: "Build Axodex Graph", status: "queued", detail: "Index symbols + relationships for navigation." },
  { id: "propose", title: "Propose Patch", status: "queued", detail: "Generate code changes for the highest-leverage subtask." },
  { id: "verify", title: "Verify (tsc + eslint + tests)", status: "queued", detail: "Run typecheck, lint, and test suite." },
  { id: "report", title: "Report", status: "queued", detail: "Summarize what changed, what was tested, what remains." },
];

export default function AgentPage() {
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string>("");

  const reset = () => {
    setSteps(DEFAULT_STEPS.map((s) => ({ ...s, status: "queued" as StepStatus })));
    setReport("");
    setGoal("");
  };

  const run = async () => {
    if (!goal.trim()) {
      toast.error("Enter a goal first");
      return;
    }
    setRunning(true);
    setReport("");
    const current = DEFAULT_STEPS.map((s) => ({ ...s, status: "queued" as StepStatus }));
    setSteps(current);

    // Simulate the goal loop — in production this calls POST /api/axoniz/agent/task + SSE.
    for (let i = 0; i < current.length; i++) {
      current[i].status = "running";
      setSteps([...current]);
      await sleep(800);
      current[i].status = "verifying";
      setSteps([...current]);
      await sleep(600);
      current[i].status = "complete";
      current[i].latencyMs = Math.round(800 + Math.random() * 1500);
      current[i].tokensIn = Math.round(400 + Math.random() * 1200);
      current[i].tokensOut = Math.round(150 + Math.random() * 800);
      current[i].costUsd = ((current[i].tokensIn! * 0.5 + current[i].tokensOut! * 1.5) / 1_000_000);
      setSteps([...current]);
    }
    setReport(`Pursued goal: "${goal}". Ran 6 steps (decompose → audit → graph → propose → verify → report). All verification gates passed. Estimated cost: $${current.reduce((a, s) => a + (s.costUsd ?? 0), 0).toFixed(4)}.`);
    setRunning(false);
    toast.success("Goal completed");
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-3xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Goal"
          description="Autonomous goal pursuit — plan → execute → verify → report. Each goal gets an ID for resume. Distinct from Chat (lightweight) and Agent (one-shot full arsenal)."
          actions={running && <StatusPill status="running" label="running" />}
        />

        {/* Goal input */}
        <GlassCard className="mb-4">
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="State your goal — e.g. 'add tests for the agent.run loop' or 'refactor file_tools.ts to use async/await'"
            className="min-h-[80px] border-0 bg-transparent focus-visible:ring-0"
            disabled={running}
          />
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-[10px] text-muted-foreground font-mono">6-step loop · ~10s simulated</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={reset} disabled={running} className="press">
                <RotateCcw className="w-3 h-3" /> Reset
              </Button>
              <Button size="sm" onClick={run} disabled={running || !goal.trim()} className="press">
                {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {running ? "Pursuing…" : "Pursue Goal"}
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* Step list */}
        {steps.every((s) => s.status === "queued") && !goal ? (
          <EmptyState icon={Bot} title="Enter a goal to begin · or open /goal/<id> to resume" hint="The agent will plan, execute, verify, and report. Each goal gets an ID for resume." />
        ) : (
          <div className="space-y-2 mb-6">
            {steps.map((step, i) => (
              <StepRow key={step.id} step={step} index={i + 1} />
            ))}
          </div>
        )}

        {/* Report */}
        {report && (
          <>
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Final Report</h2>
            <GlassCard>
              <div className="text-[12px] leading-relaxed whitespace-pre-wrap">{report}</div>
            </GlassCard>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function StepRow({ step, index }: { step: Step; index: number }) {
  const Icon = step.status === "complete"
    ? CheckCircle2
    : step.status === "failed"
    ? AlertCircle
    : step.status === "running" || step.status === "verifying"
    ? Loader2
    : Circle;
  const color = step.status === "complete"
    ? "text-accent"
    : step.status === "failed"
    ? "text-destructive"
    : step.status === "running" || step.status === "verifying"
    ? "text-foreground/70"
    : "text-muted-foreground";

  return (
    <GlassCard className="p-3">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-md glass-inset flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 mt-0.5">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={cn("w-4 h-4", color, (step.status === "running" || step.status === "verifying") && "animate-spin")} />
            <span className="text-[12px] font-medium">{step.title}</span>
            {step.status !== "queued" && (
              <StatusPill
                status={step.status === "complete" ? "ok" : step.status === "failed" ? "error" : "running"}
                label={step.status}
              />
            )}
          </div>
          {step.detail && <div className="text-[11px] text-muted-foreground mt-1">{step.detail}</div>}
          {step.status === "complete" && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground font-mono">
              {step.latencyMs && <span>{step.latencyMs}ms</span>}
              {step.tokensIn && <span>{step.tokensIn} in</span>}
              {step.tokensOut && <span>{step.tokensOut} out</span>}
              {step.costUsd && <span>${step.costUsd.toFixed(4)}</span>}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
