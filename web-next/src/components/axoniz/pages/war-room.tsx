"use client";

import { motion } from "framer-motion";
import {
  Network,
  Cpu,
  Layers,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  Trophy,
  Workflow,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSwarmStatusQuery, useWarRoomQuery } from "../queries";

export function WarRoomPage() {
  const { data: swarm, isLoading: swarmLoading } = useSwarmStatusQuery();
  const { data: war, isLoading: warLoading } = useWarRoomQuery();
  const status = war?.status;
  const workers = status?.workers ?? [];
  const expertMode = swarm?.expert_mode ?? false;
  const progress = status?.progress ?? 0;
  const activeTask = status?.active_task;
  const elapsedSec = status?.started_at
    ? Math.max(0, Math.floor(Date.now() / 1000 - status.started_at))
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />
          War Room
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Worker Swarm — parallel sub-agent orchestration with critic gate.
        </p>
      </div>

      {/* Expert mode + active task banner */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="surface p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
            Swarm Mode
          </div>
          {swarmLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${expertMode ? "bg-accent animate-blink" : "bg-primary/60"}`}
              />
              <span className="text-sm font-mono">
                {expertMode ? "EXPERT" : "STANDARD"}
              </span>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground/70 mt-1.5 leading-snug">
            {swarm?.description}
          </div>
        </Card>

        <Card className="surface p-4 md:col-span-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
            Active Mission
          </div>
          {warLoading ? (
            <Skeleton className="h-5 w-3/4" />
          ) : activeTask ? (
            <>
              <div className="text-sm font-medium text-foreground/90 leading-snug">
                {activeTask}
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                {elapsedSec !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(elapsedSec)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Workflow className="w-3 h-3" />
                  {workers.length} workers
                </span>
                <span className="inline-flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-primary" />
                  {Math.round(progress * 100)}% complete
                </span>
              </div>
              <Progress value={progress * 100} className="h-1 mt-3" />
            </>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              No active mission — swarm idle.
            </div>
          )}
        </Card>
      </div>

      {/* Swarm models per role */}
      {swarm && (
        <div className="px-5 pb-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Phase Models — RAM-aware hot-swap
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {Object.entries(swarm.roles).map(([role, st]) => (
              <Card key={role} className="surface p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-widest text-primary/80">
                    {role}
                  </span>
                  {st.ready ? (
                    <CheckCircle2 className="w-3 h-3 text-accent" />
                  ) : (
                    <XCircle className="w-3 h-3 text-destructive" />
                  )}
                </div>
                <div className="font-mono text-[11px] truncate text-foreground/80">
                  {st.name || "—"}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Worker cards */}
      <div className="px-5 pb-5">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Workers
        </h3>
        {warLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="surface p-3 h-24">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-2" />
                <Skeleton className="h-6 w-full" />
              </Card>
            ))}
          </div>
        ) : workers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {workers.map((w, idx) => (
              <WorkerCard key={w.id} worker={w} delay={idx * 30} />
            ))}
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-12">
            No workers deployed.
          </div>
        )}
      </div>
    </div>
  );
}

function WorkerCard({
  worker,
  delay,
}: {
  worker: {
    id: string;
    role: string;
    status: string;
    model?: string;
    subtask?: string;
    result_score?: number;
    started_at?: number;
    finished_at?: number;
  };
  delay: number;
}) {
  const Icon =
    worker.status === "complete"
      ? CheckCircle2
      : worker.status === "failed"
        ? XCircle
        : worker.status === "queued"
          ? Clock
          : Loader2;

  const isSpinning = worker.status === "running";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.25 }}
    >
      <Card className="surface hoverable p-3 flex items-start gap-3">
        <div
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${statusBg(
            worker.status,
          )}`}
        >
          <Icon
            className={`w-4 h-4 ${statusColor(worker.status)} ${isSpinning ? "animate-spin" : ""}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-mono text-[11px] text-foreground/80">
              {worker.id}
            </span>
            <span
              className={`text-[9px] uppercase tracking-widest ${statusColor(
                worker.status,
              )}`}
            >
              {worker.status}
            </span>
          </div>
          {worker.subtask && (
            <div className="text-xs text-foreground/90 leading-snug mb-1">
              {worker.subtask}
            </div>
          )}
          {worker.model && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 font-mono truncate">
              <Cpu className="w-2.5 h-2.5 shrink-0" />
              {worker.model}
            </div>
          )}
          {worker.result_score !== undefined && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
              <Trophy className="w-2.5 h-2.5 text-primary" />
              Critic score
              <Badge
                variant="outline"
                className="ml-auto h-4 px-1 border-accent/30 bg-accent/10 text-accent text-[9px] font-mono"
              >
                {Math.round(worker.result_score * 100)}
              </Badge>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function statusBg(s: string): string {
  switch (s) {
    case "complete":
      return "bg-accent/15";
    case "running":
      return "bg-primary/15";
    case "failed":
      return "bg-destructive/15";
    default:
      return "bg-white/5";
  }
}
function statusColor(s: string): string {
  switch (s) {
    case "complete":
      return "text-accent";
    case "running":
      return "text-primary";
    case "failed":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
