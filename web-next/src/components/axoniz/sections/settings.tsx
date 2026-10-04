"use client";

import { useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Cpu,
  Server,
  Shield,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Cog,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { axonizClient } from "@/lib/axoniz/client";
import {
  useAxonizStore,
  type ProviderId,
  type ProviderConfig,
} from "@/stores/axoniz-store";

interface ProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  defaultBaseUrl: string;
  fields: Array<"baseUrl" | "apiKey" | "model">;
  docsUrl: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "llamacpp",
    name: "llama.cpp (native)",
    description: "Zero-overhead GGUF inference. The AXONIZ default.",
    defaultBaseUrl: "http://localhost:8080",
    fields: [],
    docsUrl: "https://github.com/ggerganov/llama.cpp",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    description: "Local OpenAI-compatible server. Default port 1234.",
    defaultBaseUrl: "http://localhost:1234/v1",
    fields: ["baseUrl", "apiKey", "model"],
    docsUrl: "https://lmstudio.ai/docs/api-server",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local Ollama daemon. Default port 11434.",
    defaultBaseUrl: "http://localhost:11434",
    fields: ["baseUrl", "model"],
    docsUrl: "https://ollama.com/docs/api",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Cloud. Breaks the offline guarantee but supported.",
    defaultBaseUrl: "https://api.openai.com/v1",
    fields: ["baseUrl", "apiKey", "model"],
    docsUrl: "https://platform.openai.com/docs/api-reference",
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    description: "Any endpoint that speaks the OpenAI chat protocol.",
    defaultBaseUrl: "",
    fields: ["baseUrl", "apiKey", "model"],
    docsUrl: "",
  },
];

interface TestState {
  status: "idle" | "loading" | "ok" | "error";
  latencyMs?: number;
  models?: string[];
  error?: string;
}

export function SettingsSection() {
  const {
    activeProvider,
    setActiveProvider,
    providers,
    setProvider,
    llamacpp,
    setLlamacpp,
    username,
    logout,
  } = useAxonizStore();

  const [test, setTest] = useState<Record<ProviderId, TestState>>({
    llamacpp: { status: "idle" },
    ollama: { status: "idle" },
    lmstudio: { status: "idle" },
    openai: { status: "idle" },
    custom: { status: "idle" },
  });

  const activeMeta = PROVIDERS.find((p) => p.id === activeProvider)!;
  const activeCfg = providers[activeProvider];

  async function runTest(id: ProviderId) {
    const meta = PROVIDERS.find((p) => p.id === id)!;
    const cfg = providers[id];
    setTest((t) => ({ ...t, [id]: { status: "loading" } }));
    try {
      const result = await axonizClient.testProvider({
        provider: id,
        baseUrl: cfg.baseUrl || meta.defaultBaseUrl,
        apiKey: cfg.apiKey || undefined,
      });
      setTest((t) => ({ ...t, [id]: result }));
      if (result.ok) {
        toast.success(`${meta.name} reachable`, {
          description: `${result.models.length} models visible · ${result.latencyMs}ms`,
        });
      } else {
        toast.error(`${meta.name} test failed`, {
          description: result.error,
        });
      }
    } catch (err) {
      setTest((t) => ({
        ...t,
        [id]: { status: "error", error: err instanceof Error ? err.message : "Unknown" },
      }));
      toast.error("Test request failed");
    }
  }

  async function saveAll() {
    // Persist to localStorage (happens automatically via Zustand persist)
    // and also sync to the real AXONIZ backend if it's reachable.
    try {
      await axonizClient.saveConfig({
        llm: {
          active_provider: activeProvider,
          n_ctx: llamacpp.nCtx,
          n_gpu_layers: llamacpp.nGpuLayers,
          n_threads: llamacpp.nThreads,
        },
        providers: Object.fromEntries(
          Object.entries(providers).map(([k, v]) => [k, v]),
        ),
      });
      toast.success("Configuration saved", {
        description: "Persisted locally. Synced to AXONIZ backend if reachable.",
      });
    } catch {
      toast.error("Save failed");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 h-10 border-b border-border flex items-center justify-between shrink-0 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <SettingsIcon className="w-3.5 h-3.5" />
          Settings
        </h2>
        <Button onClick={saveAll} size="sm" className="h-7 text-[11px] gap-1.5">
          <Save className="w-3 h-3" />
          Save
        </Button>
      </div>

      <div className="p-4 max-w-3xl space-y-4">
        {/* Active provider selector */}
        <Card className="surface p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Server className="w-3.5 h-3.5" />
            <h3 className="text-[13px] font-medium">Inference Provider</h3>
            <span className="text-[11px] text-muted-foreground ml-auto">
              Active: <span className="font-mono text-foreground/90">{activeMeta.name}</span>
            </span>
          </div>
          <div className="divide-y divide-border">
            {PROVIDERS.map((meta) => {
              const cfg = providers[meta.id];
              const t = test[meta.id];
              const isActive = activeProvider === meta.id;
              return (
                <button
                  key={meta.id}
                  onClick={() => setActiveProvider(meta.id)}
                  className={`w-full text-left px-4 py-2.5 transition-colors flex items-center gap-3 ${
                    isActive ? "bg-primary/5" : "hover:bg-secondary/60"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{meta.name}</span>
                      {isActive && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 border-foreground/20 bg-foreground/5 text-foreground text-[9px] uppercase"
                        >
                          Active
                        </Badge>
                      )}
                      {t.status === "ok" && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 border-accent/30 bg-accent/10 text-accent text-[9px] gap-1"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {t.latencyMs}ms
                        </Badge>
                      )}
                      {t.status === "error" && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 border-destructive/30 bg-destructive/10 text-destructive text-[9px] gap-1"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Fail
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {meta.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Active provider config form */}
        <Card className="surface p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Cog className="w-3.5 h-3.5" />
            <h3 className="text-[13px] font-medium">{activeMeta.name} Configuration</h3>
            <a
              href={activeMeta.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Docs ↗
            </a>
          </div>

          <div className="p-4 space-y-4">
            {activeProvider === "llamacpp" ? (
              <LlamacppForm
                cfg={llamacpp}
                onChange={setLlamacpp}
                test={test.llamacpp}
                onTest={() => runTest("llamacpp")}
              />
            ) : (
              <ProviderForm
                meta={activeMeta}
                cfg={activeCfg}
                onChange={(patch) => setProvider(activeProvider, patch)}
                test={test[activeProvider]}
                onTest={() => runTest(activeProvider)}
              />
            )}
          </div>
        </Card>

        {/* Authority */}
        <Card className="surface p-0">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            <h3 className="text-[13px] font-medium">Authority</h3>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-xs">
            <Pair label="Persona" value="AXONIZ" />
            <Pair label="Authority level" value="3 of 5" />
          </div>
        </Card>

        {/* Session */}
        <Card className="surface p-0">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5" />
            <h3 className="text-[13px] font-medium">Session</h3>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-xs">
            <Pair label="Operator" value={username ?? "—"} />
            <Pair label="Vault home" value="~/.axoniz" />
          </div>
          <Separator className="bg-border" />
          <div className="px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 h-7 text-[11px]"
            >
              End session
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProviderForm({
  meta,
  cfg,
  onChange,
  test,
  onTest,
}: {
  meta: ProviderMeta;
  cfg: ProviderConfig;
  onChange: (patch: Partial<ProviderConfig>) => void;
  test: TestState;
  onTest: () => void;
}) {
  return (
    <div className="space-y-3.5">
      {meta.fields.includes("baseUrl") && (
        <Field
          label="Base URL"
          hint="OpenAI-compatible endpoint, no trailing slash"
          value={cfg.baseUrl}
          placeholder={meta.defaultBaseUrl}
          onChange={(v) => onChange({ baseUrl: v })}
        />
      )}
      {meta.fields.includes("apiKey") && (
        <Field
          label="API key"
          hint={meta.id === "lmstudio" ? "LM Studio accepts any non-empty string" : "Stored locally only"}
          type="password"
          value={cfg.apiKey}
          placeholder={meta.id === "lmstudio" ? "lm-studio" : "sk-…"}
          onChange={(v) => onChange({ apiKey: v })}
        />
      )}
      {meta.fields.includes("model") && (
        <Field
          label="Model"
          hint={test.models && test.models.length > 0
            ? `Available: ${test.models.slice(0, 4).join(", ")}${test.models.length > 4 ? "…" : ""}`
            : "Model identifier as the server expects"}
          value={cfg.model}
          placeholder={meta.id === "ollama" ? "llama3.2:3b" : meta.id === "openai" ? "gpt-4o-mini" : ""}
          onChange={(v) => onChange({ model: v })}
        />
      )}

      {/* Test result detail */}
      {test.status === "error" && test.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive font-mono break-words">
          {test.error}
        </div>
      )}
      {test.status === "ok" && test.models && test.models.length > 0 && (
        <div className="rounded-md border border-accent/20 bg-accent/5 p-3">
          <div className="text-[10px] uppercase tracking-widest text-accent mb-1.5">
            Models available ({test.models.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {test.models.slice(0, 12).map((m) => (
              <Badge
                key={m}
                variant="outline"
                className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground"
              >
                {m}
              </Badge>
            ))}
            {test.models.length > 12 && (
              <span className="text-[10px] text-muted-foreground">
                +{test.models.length - 12} more
              </span>
            )}
          </div>
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={onTest}
        disabled={test.status === "loading"}
        className="h-8 text-[11px] gap-1.5"
      >
        {test.status === "loading" ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Plus className="w-3 h-3" />
        )}
        Test connection
      </Button>
    </div>
  );
}

function LlamacppForm({
  cfg,
  onChange,
  test,
  onTest,
}: {
  cfg: { modelPath: string; nCtx: number; nGpuLayers: number; nThreads: number };
  onChange: (patch: Partial<typeof cfg>) => void;
  test: TestState;
  onTest: () => void;
}) {
  return (
    <div className="space-y-3.5">
      <Field
        label="Model path"
        hint="Absolute path to the .gguf file in your Vault"
        value={cfg.modelPath}
        placeholder="~/.axoniz/models/your-model.gguf"
        onChange={(v) => onChange({ modelPath: v })}
        mono
      />
      <Field
        label="llama-server URL"
        hint="If running llama.cpp in server mode. Test connection hits /health."
        value=""
        placeholder="http://localhost:8080"
        onChange={() => {}}
        mono
      />
      <div className="grid grid-cols-3 gap-3">
        <SliderCell
          label="Context"
          value={cfg.nCtx}
          min={1024}
          max={32768}
          step={1024}
          onChange={(v) => onChange({ nCtx: v })}
          format={(v) => `${(v / 1024).toFixed(0)}K`}
        />
        <SliderCell
          label="GPU layers"
          value={cfg.nGpuLayers}
          min={0}
          max={99}
          step={1}
          onChange={(v) => onChange({ nGpuLayers: v })}
          format={(v) => (v === 0 ? "CPU" : v >= 99 ? "Full" : `${v}`)}
        />
        <SliderCell
          label="Threads"
          value={cfg.nThreads}
          min={1}
          max={32}
          step={1}
          onChange={(v) => onChange({ nThreads: v })}
          format={(v) => `${v}`}
        />
      </div>

      {test.status === "error" && test.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive font-mono break-words">
          {test.error}
        </div>
      )}
      {test.status === "ok" && (
        <div className="rounded-md border border-accent/20 bg-accent/5 p-3 text-[11px] text-accent">
          llama-server healthy · {test.latencyMs}ms
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={onTest}
        disabled={test.status === "loading"}
        className="h-8 text-[11px] gap-1.5"
      >
        {test.status === "loading" ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Plus className="w-3 h-3" />
        )}
        Test connection
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  placeholder,
  onChange,
  type = "text",
  mono = false,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 bg-input border-border text-[13px] ${mono ? "font-mono" : ""}`}
        autoComplete="off"
        spellCheck={false}
      />
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function SliderCell({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="font-mono text-[13px] text-foreground/90">{format(value)}</div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="font-mono text-xs text-foreground/90 truncate">{value}</div>
    </div>
  );
}
