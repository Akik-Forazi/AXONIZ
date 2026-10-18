"use client";

/**
 * /workflows — create + run workflows.
 *
 * A workflow is a YAML file with a trigger + ordered steps. Each step is
 * one tool invocation. Steps can reference previous results via
 * {{step_id.field}} mustache syntax.
 *
 * Stored at ~/.axoniz/workflows/<name>.yml — git-syncable.
 */
import { useState, useEffect, useCallback } from "react";
import { Workflow, Play, Trash2, Loader2, Clock, FileCode, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import * as yaml from "js-yaml";

interface WorkflowMeta {
  name: string;
  description: string;
  projectId: string | null;
  trigger: { type: string; [k: string]: unknown };
  steps: { id: string; tool: string; args: Record<string, unknown> }[];
  enabled: boolean;
  createdAt: number;
  lastRunAt: number | null;
  maxMinutes: number;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  projectId: string | null;
  startedAt: number;
  endedAt: number | null;
  status: "running" | "success" | "failed" | "cancelled" | "timeout";
  stepsCompleted: number;
  stepsTotal: number;
  error: string | null;
}

const SAMPLE_WORKFLOW = `name: fetch-and-log
description: Fetch example.com and log the body length. Simple smoke test.
trigger:
  type: manual
steps:
  - id: fetch
    tool: http
    args:
      get: https://example.com
  - id: log_len
    tool: log
    args:
      message: "Fetched example.com, body length = {{fetch.body.length}}"
      level: info
maxMinutes: 5
enabled: true
`;

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [newYaml, setNewYaml] = useState(SAMPLE_WORKFLOW);
  const [saving, setSaving] = useState(false);
  const [runningWf, setRunningWf] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wfR, runsR] = await Promise.all([
        fetch("/api/axoniz/v2/workflows"),
        fetch("/api/axoniz/v2/runs?limit=20"),
      ]);
      const wfData = await wfR.json();
      const runsData = await runsR.json();
      setWorkflows(wfData.workflows ?? []);
      setRuns(runsData.runs ?? []);
    } catch (e) {
      toast.error("Failed to load workflows", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveWorkflow() {
    setSaving(true);
    try {
      const r = await fetch("/api/axoniz/v2/workflows", {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: newYaml,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Validation failed");
      }
      const wf = await r.json();
      toast.success(`Workflow saved`, { description: wf.name });
      await load();
    } catch (e) {
      toast.error("Failed to save workflow", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow(name: string) {
    setRunningWf(name);
    try {
      const r = await fetch(`/api/axoniz/v2/workflows/${name}/run`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Run failed");
      }
      const run = await r.json();
      if (run.status === "success") {
        toast.success(`Workflow completed`, { description: `${name} — ${run.stepsCompleted}/${run.stepsTotal} steps` });
      } else {
        toast.error(`Workflow ${run.status}`, { description: run.error ?? name });
      }
      await load();
    } catch (e) {
      toast.error("Failed to run workflow", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunningWf(null);
    }
  }

  async function deleteWorkflow(name: string) {
    if (!confirm(`Delete workflow "${name}"?`)) return;
    try {
      await fetch(`/api/axoniz/v2/workflows/${name}`, { method: "DELETE" });
      toast.success("Workflow deleted");
      await load();
    } catch (e) {
      toast.error("Failed to delete", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  function statusIcon(status: WorkflowRun["status"]) {
    switch (status) {
      case "running": return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
      case "success": return <CheckCircle2 className="w-3 h-3 text-green-500" />;
      case "failed": return <XCircle className="w-3 h-3 text-red-500" />;
      case "timeout": return <AlertTriangle className="w-3 h-3 text-amber-500" />;
      case "cancelled": return <XCircle className="w-3 h-3 text-muted-foreground" />;
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Workflow className="w-3.5 h-3.5" />Workflows
        </h2>
        <span className="text-[11px] text-muted-foreground">{workflows.length} defined</span>
      </div>

      <div className="p-4 max-w-3xl space-y-4">
        {/* Create new workflow */}
        <Card className="glass elev-2 smooth p-4">
          <div className="text-[13px] font-medium mb-2 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5" />New workflow (YAML)
          </div>
          <div className="text-[11px] text-muted-foreground/80 mb-3">
            Edit the YAML below, then click Save. The file is stored at <code className="font-mono">~/.axoniz/workflows/&lt;name&gt;.yml</code> — git-syncable.
          </div>
          <textarea
            value={newYaml}
            onChange={(e) => setNewYaml(e.target.value)}
            className="w-full h-64 p-3 rounded-md border border-border bg-input text-[12px] font-mono text-foreground/90 leading-relaxed resize-y focus:outline-none focus:border-ring"
            spellCheck={false}
          />
          <div className="flex justify-end mt-2">
            <Button size="sm" onClick={saveWorkflow} disabled={saving} className="h-8 gap-1.5 text-[12px]">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              {saving ? "Saving..." : "Save workflow"}
            </Button>
          </div>
        </Card>

        {/* Existing workflows */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />Loading...
          </div>
        ) : workflows.length === 0 ? (
          <Card className="surface p-6 text-center">
            <Workflow className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
            <div className="text-[13px] text-muted-foreground">No workflows defined yet.</div>
            <div className="text-[11px] text-muted-foreground/60 mt-1">
              Save the sample workflow above to get started.
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {workflows.map((wf) => (
              <Card key={wf.name} className="glass elev-1 smooth p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium flex items-center gap-2">
                      {wf.name}
                      {wf.enabled && <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 h-4 text-green-500 border-green-500/30 bg-green-500/5">enabled</Badge>}
                    </div>
                    {wf.description && (
                      <div className="text-[11px] text-muted-foreground/80 mt-0.5">{wf.description}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                      <Badge variant="outline" className="px-1.5 py-0 h-5">
                        <Clock className="w-2.5 h-2.5 mr-1" />
                        {String((wf.trigger as { type: string }).type)}
                      </Badge>
                      <Badge variant="outline" className="px-1.5 py-0 h-5">
                        {wf.steps.length} steps
                      </Badge>
                      <Badge variant="outline" className="px-1.5 py-0 h-5">
                        max {wf.maxMinutes}min
                      </Badge>
                      {wf.projectId && (
                        <Badge variant="outline" className="px-1.5 py-0 h-5">project: {wf.projectId}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => runWorkflow(wf.name)}
                      disabled={runningWf === wf.name}
                      title="Run now"
                    >
                      {runningWf === wf.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteWorkflow(wf.name)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Recent runs */}
        {runs.length > 0 && (
          <Card className="glass elev-2 smooth p-4">
            <div className="text-[13px] font-medium mb-2 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />Recent runs
            </div>
            <div className="space-y-1">
              {runs.slice(0, 10).map((run) => (
                <div key={run.id} className="flex items-center gap-2 py-1 text-[11px] border-b border-border last:border-b-0">
                  {statusIcon(run.status)}
                  <span className="font-mono text-foreground/90 flex-1 truncate">{run.workflowId}</span>
                  <span className="text-muted-foreground">
                    {run.stepsCompleted}/{run.stepsTotal} steps
                  </span>
                  <span className="text-muted-foreground/60 font-mono">
                    {new Date(run.startedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
