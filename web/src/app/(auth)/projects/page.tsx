"use client";

/**
 * /projects — register + manage project folders.
 *
 * User points AXONIZ at a folder (e.g. `~/projects/foo` or
 * `C:\Users\me\AppData\Local\some-app`), we scan it, remember what we
 * found (git, package manager, language, framework), and list it here.
 *
 * Each project gets its own workspace under ~/.axoniz/projects/:id/
 * with subdirectories for workflows, logs, and the memory palace.
 */
import { useState, useEffect, useCallback } from "react";
import { FolderKanban, Plus, Trash2, RefreshCw, GitBranch, Package, FlaskConical, Container, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ProjectMeta {
  id: string;
  path: string;
  name: string;
  registeredAt: number;
  lastScannedAt: number | null;
  detected: {
    isGitRepo: boolean;
    gitRemote: string | null;
    packageManager: string | null;
    language: string | null;
    framework: string | null;
    hasTests: boolean;
    hasDockerfile: boolean;
  };
  palaceEnabled: boolean;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/axoniz/v2/projects");
      const data = await r.json();
      setProjects(data.projects ?? []);
    } catch (e) {
      toast.error("Failed to load projects", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addProject() {
    if (!newPath.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/axoniz/v2/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error);
      }
      const project = await r.json();
      toast.success(`Project registered`, { description: `${project.name} — ${project.detected.framework ?? project.detected.language ?? "unknown"}` });
      setNewPath("");
      await load();
    } catch (e) {
      toast.error("Failed to register project", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAdding(false);
    }
  }

  async function removeProject(id: string, name: string) {
    if (!confirm(`Unregister project "${name}"? The folder on disk will not be touched. Logs at ~/.axoniz/projects/${id}/ will be kept.`)) return;
    try {
      const r = await fetch(`/api/axoniz/v2/projects/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
      toast.success("Project unregistered");
      await load();
    } catch (e) {
      toast.error("Failed to unregister", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <FolderKanban className="w-3.5 h-3.5" />Projects
        </h2>
        <span className="text-[11px] text-muted-foreground">{projects.length} registered</span>
      </div>

      <div className="p-4 max-w-3xl space-y-4">
        {/* Add new project */}
        <Card className="surface p-4">
          <div className="text-[13px] font-medium mb-2 flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" />Register a project folder
          </div>
          <div className="text-[11px] text-muted-foreground/80 mb-3">
            Point AXONIZ at any folder. We&apos;ll auto-detect git, package manager, language, and framework.
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addProject()}
              placeholder="C:\Users\me\projects\foo  or  ~/projects/foo"
              className="flex-1 h-8 px-3 rounded-md border border-border bg-input text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring"
              disabled={adding}
            />
            <Button size="sm" onClick={addProject} disabled={adding || !newPath.trim()} className="h-8 gap-1.5 text-[12px]">
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
        </Card>

        {/* Project list */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />Loading...
          </div>
        ) : projects.length === 0 ? (
          <Card className="surface p-6 text-center">
            <FolderKanban className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
            <div className="text-[13px] text-muted-foreground">No projects registered yet.</div>
            <div className="text-[11px] text-muted-foreground/60 mt-1">
              Point AXONIZ at a folder above to get started.
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Card key={p.id} className="surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium flex items-center gap-2">
                      {p.name}
                      <span className="text-[10px] font-mono text-muted-foreground">({p.id})</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 font-mono truncate mt-0.5">
                      {p.path}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.detected.isGitRepo && (
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5">
                          <GitBranch className="w-2.5 h-2.5" />git
                        </Badge>
                      )}
                      {p.detected.packageManager && (
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5">
                          <Package className="w-2.5 h-2.5" />{p.detected.packageManager}
                        </Badge>
                      )}
                      {p.detected.language && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">{p.detected.language}</Badge>
                      )}
                      {p.detected.framework && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">{p.detected.framework}</Badge>
                      )}
                      {p.detected.hasTests && (
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5">
                          <FlaskConical className="w-2.5 h-2.5" />tests
                        </Badge>
                      )}
                      {p.detected.hasDockerfile && (
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5">
                          <Container className="w-2.5 h-2.5" />docker
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeProject(p.id, p.name)}
                    title="Unregister"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
