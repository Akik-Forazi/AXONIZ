"use client";

import { cn } from "@/lib/utils";

/** Shared page header — title + description + actions slot. */
export function PageHeader({
  title, description, actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 mb-6 px-1">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-gradient">{title}</h1>
        {description && (
          <p className="text-[13px] text-muted-foreground mt-1 text-balance leading-relaxed max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

/** Shared glass card. */
export function GlassCard({
  className, children, onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl glass-panel p-4",
        onClick && "cursor-pointer glass-hover press",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Stat tile — label + big number + optional unit + trend. */
export function StatTile({
  label, value, unit, hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-[11px] text-muted-foreground font-mono">{unit}</span>}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1 font-mono">{hint}</div>}
    </GlassCard>
  );
}

/** Empty state — when there's no data. */
export function EmptyState({
  icon: Icon, title, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl glass-inset flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-[13px] text-foreground font-medium">{title}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 max-w-md text-balance">{hint}</p>}
    </div>
  );
}

/** Loading skeleton. */
export function LoadingRow({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg glass-inset shimmer" />
      ))}
    </div>
  );
}

/** Badge for status pills. */
export function StatusPill({
  status, label,
}: {
  status: "ok" | "error" | "warn" | "idle" | "running";
  label: string;
}) {
  const cls = {
    ok: "text-accent border-accent/30 bg-accent/10",
    error: "text-destructive border-destructive/30 bg-destructive/10",
    warn: "text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10",
    idle: "text-muted-foreground border-border",
    running: "text-foreground border-foreground/30 bg-foreground/10",
  }[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border",
      cls,
    )}>
      <span className={cn(
        "w-1 h-1 rounded-full",
        status === "ok" && "bg-accent",
        status === "error" && "bg-destructive",
        status === "warn" && "bg-amber-500",
        status === "running" && "bg-foreground animate-pulse-dot",
        status === "idle" && "bg-muted-foreground",
      )} />
      {label}
    </span>
  );
}
