/**
 * AXONIZ TUI — production terminal interface.
 * Uses real agent.run() with tool calls, real slash commands,
 * real provider switching, real config persistence.
 *
 * Agent callbacks wired to React state:
 *   onToken      → append to current assistant message
 *   onToolCall    → render tool call indicator
 *   onToolResult  → render tool result
 *   onStep        → update step counter
 *   onThought     → show reasoning preview
 *   onDone        → mark response complete
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";
import { createAgent, getProviderInfo, PROVIDER_CATALOG, saveConfig } from "./lib/agent-bridge.js";
import { SLASH_COMMANDS, handleSlash } from "./lib/slash-commands.js";

// ── Types ───────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  pending?: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  step?: number;
  totalSteps?: number;
}

// ── Markdown rendering ──────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  // Split on `code` spans first
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <Text key={i} color="cyan" bold>{part.slice(1, -1)}</Text>;
    }
    // Split on **bold** and *italic*
    const sub = part.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return sub.map((s, j) => {
      if (s.startsWith("**") && s.endsWith("**")) return <Text key={`${i}-${j}`} bold color="white">{s.slice(2, -2)}</Text>;
      if (s.startsWith("*") && s.endsWith("*") && s.length > 2) return <Text key={`${i}-${j}`} italic>{s.slice(1, -1)}</Text>;
      return <Text key={`${i}-${j}`} color="gray">{s}</Text>;
    });
  });
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (!inCode) { inCode = true; codeLang = line.slice(3).trim(); codeBuf = []; }
      else {
        inCode = false;
        nodes.push(
          <Box key={`code-${i}`} flexDirection="column" borderStyle="round" borderColor="cyan" marginY={0}>
            <Text color="cyan" dimColor>{` ${codeLang || "code"} `}</Text>
            {codeBuf.map((c, ci) => <Text key={ci} color="cyan">{`  ${c}`}</Text>)}
          </Box>
        );
        codeBuf = [];
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (!line.trim()) { nodes.push(<Box key={`sp-${i}`} height={0} />); continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const body = line.replace(/^\s*[-*]\s+/, "");
      nodes.push(<Box key={`b-${i}`} paddingLeft={1}><Text color="magenta">▸ </Text><Text color="gray">{renderInline(body)}</Text></Box>);
      continue;
    }
    const num = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (num) {
      nodes.push(<Box key={`n-${i}`} paddingLeft={1}><Text color="magenta">{num[2]}. </Text><Text color="gray">{renderInline(num[3])}</Text></Box>);
      continue;
    }
    if (line.startsWith("### ")) { nodes.push(<Box key={`h-${i}`} paddingLeft={1}><Text bold color="magenta">{renderInline(line.slice(4))}</Text></Box>); continue; }
    if (line.startsWith("## ")) { nodes.push(<Box key={`h-${i}`} paddingLeft={1}><Text bold color="magenta">{renderInline(line.slice(3))}</Text></Box>); continue; }
    if (line.startsWith("# ")) { nodes.push(<Box key={`h-${i}`} paddingLeft={1}><Text bold color="magenta">{renderInline(line.slice(2))}</Text></Box>); continue; }
    nodes.push(<Box key={`t-${i}`} paddingLeft={1}><Text color="gray">{renderInline(line)}</Text></Box>);
  }
  if (inCode && codeBuf.length) {
    nodes.push(<Box key="code-flush" flexDirection="column" borderStyle="round" borderColor="cyan"><Text color="cyan" dimColor>{` ${codeLang} `}</Text>{codeBuf.map((c, i) => <Text key={i} color="cyan">{`  ${c}`}</Text>)}</Box>);
  }
  return <>{nodes}</>;
}

// ── Spinner ────────────────────────────────────────────────────────────

function Spinner({ text }: { text: string }) {
  const [f, setF] = useState(0);
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  useEffect(() => {
    const id = setInterval(() => setF(i => (i + 1) % frames.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="magenta">{frames[f]} {text}</Text>;
}

// ── Suggestions ────────────────────────────────────────────────────────

function Suggestions({ items, selected }: { items: typeof SLASH_COMMANDS; selected: number }) {
  if (!items.length) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {items.slice(0, 8).map((s, i) => (
        <Text key={s.value} color={i === selected ? "magenta" : "gray"}>
          {i === selected ? "▸ " : "  "}{s.value.padEnd(14)} {s.description}
        </Text>
      ))}
    </Box>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────

function Footer({ provider, model, tokens, elapsed, step, totalSteps }: {
  provider: string; model: string; tokens: number; elapsed: number; step?: number; totalSteps?: number;
}) {
  const tok = tokens > 0 ? `${tokens > 999 ? (tokens / 1000).toFixed(1) + "k" : tokens} tok` : "—";
  const el = elapsed > 0 ? `${elapsed}s` : "";
  const stepInfo = step && totalSteps ? `step ${step}/${totalSteps}` : "";
  return (
    <Box justifyContent="space-between">
      <Text color="gray"><Text color="magenta">◈</Text> {provider}<Text color="gray">/</Text><Text color="cyan">{model}</Text></Text>
      <Text color="gray">{[tok, el, stepInfo].filter(Boolean).join(" · ")}</Text>
    </Box>
  );
}

// ── Main App ────────────────────────────────────────────────────────────

export function App() {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const agentRef = useRef<any>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [step, setStep] = useState<{ cur: number; total: number } | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [footer, setFooter] = useState({ provider: "axoniz", model: "auto" });
  const elapsedStart = useRef<number | null>(null);
  const currentAssistantId = useRef<string | null>(null);

  // ── Init agent ──
  useEffect(() => {
    const args = process.argv.slice(2);
    let prov: string | undefined;
    let workspace: string | undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--provider" && args[i + 1]) { prov = args[i + 1]; }
      if (args[i] === "--workspace" && args[i + 1]) { workspace = args[i + 1]; }
      if (args[i] === "--test-mode") { prov = "test-mock"; }
    }
    try {
      agentRef.current = createAgent(prov, workspace);
      const info = getProviderInfo(agentRef.current);
      setFooter({ provider: info.provider, model: info.model });
      // Skip API key warning in test mode
      if (prov !== "test-mock") {
        const meta = PROVIDER_CATALOG.find(p => p.id === info.provider);
        if (meta?.needsApiKey && !info.hasKey) {
          const envKey = `${info.provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
          setMessages([{ id: "warn", role: "system", content: `⚠ No API key for ${info.provider}. Set: ${envKey}=<key>` }]);
        }
      }
    } catch (e) {
      setMessages([{ id: "err", role: "system", content: `Failed to init: ${e instanceof Error ? e.message : String(e)}` }]);
    }
  }, []);

  // ── Timer ──
  useEffect(() => {
    if (!busy) { elapsedStart.current = null; setStep(undefined); setStatus(""); return; }
    elapsedStart.current = Date.now();
    const id = setInterval(() => {
      if (elapsedStart.current) setElapsed(Math.floor((Date.now() - elapsedStart.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [busy]);

  // ── Suggestions ──
  const suggestions = input.startsWith("/") && !input.includes(" ")
    ? SLASH_COMMANDS.filter(c => c.value.startsWith(input)) : [];
  const [selIdx, setSelIdx] = useState(0);
  useEffect(() => setSelIdx(0), [input]);

  // ── Submit handler ──
  const submit = useCallback(async (raw: string) => {
    if (raw === "exit" || raw === "quit") { exit(); return; }
    if (!raw.trim() || busy) return;

    const agent = agentRef.current;
    if (!agent) { setMessages(p => [...p, { id: `e${Date.now()}`, role: "system", content: "Agent not initialized." }]); return; }

    // Shell command
    if (raw.startsWith("!")) {
      const cmd = raw.slice(1).trim();
      setMessages(p => [...p, { id: `u${Date.now()}`, role: "user", content: raw }]);
      setHistory(h => [...h, raw]); setInput("");
      try {
        const { execSync } = require("child_process");
        const out = execSync(cmd, { encoding: "utf-8", timeout: 30000, maxBuffer: 1024*1024*2 });
        setMessages(p => [...p, { id: `a${Date.now()}`, role: "assistant", content: out || "(no output)" }]);
      } catch (e: any) {
        setMessages(p => [...p, { id: `a${Date.now()}`, role: "system", content: `[ERROR] ${e.message ?? e}` }]);
      }
      return;
    }

    // File mention
    if (raw.startsWith("@")) {
      const fp = raw.slice(1).trim();
      setMessages(p => [...p, { id: `u${Date.now()}`, role: "user", content: raw }]);
      setHistory(h => [...h, raw]); setInput("");
      try {
        const content = require("fs").readFileSync(fp, "utf-8");
        const preview = content.length > 2000 ? content.slice(0, 2000) + "\n..." : content;
        setMessages(p => [...p, { id: `a${Date.now()}`, role: "assistant", content: preview }]);
      } catch (e: any) {
        setMessages(p => [...p, { id: `a${Date.now()}`, role: "system", content: `[ERROR] ${e.message ?? e}` }]);
      }
      return;
    }

    // Slash command
    if (raw.startsWith("/")) {
      setMessages(p => [...p, { id: `u${Date.now()}`, role: "user", content: raw }]);
      setHistory(h => [...h, raw]); setInput("");
      setBusy(true); setElapsed(0);
      const aid = `a${Date.now()}`;
      setMessages(p => [...p, { id: aid, role: "assistant", content: "", pending: true }]);
      try {
        const result = await handleSlash(raw, agent);
        if (result.action === "clear") { setMessages([]); setBusy(false); return; }
        if (result.action === "exit") { exit(); return; }
        if (result.newFooter) setFooter(f => ({ ...f, ...result.newFooter }));
        setMessages(p => p.map(m => m.id === aid ? { ...m, content: result.output ?? "(no output)", pending: false } : m));
      } catch (e: any) {
        setMessages(p => p.map(m => m.id === aid ? { ...m, content: `[ERROR] ${e.message ?? e}`, pending: false } : m));
      }
      setBusy(false);
      return;
    }

    // ── Regular chat/agent — use agent.run() for full tool-calling loop ──
    setMessages(p => [...p, { id: `u${Date.now()}`, role: "user", content: raw }]);
    setHistory(h => [...h, raw]); setInput("");
    setBusy(true); setElapsed(0); setTokens(0);
    setStatus("preparing");

    const aid = `a${Date.now()}`;
    currentAssistantId.current = aid;
    setMessages(p => [...p, { id: aid, role: "assistant", content: "", pending: true }]);

    // ── Wire agent callbacks to React state ──
    agent.onToken = (tok: string) => {
      setTokens(t => t + tok.length);
      setMessages(p => p.map(m => m.id === aid ? { ...m, content: m.content + tok } : m));
    };
    agent.onToolCall = (name: string, args: Record<string, unknown>) => {
      setStatus(`calling ${name}`);
      const tid = `t${Date.now()}`;
      setMessages(p => [...p, { id: tid, role: "tool", content: "", toolName: name, toolArgs: args }]);
    };
    agent.onToolResult = (name: string, result: string) => {
      const tid = `t${Date.now()}`;
      const failed = result.startsWith("[ERROR]");
      setMessages(p => [...p, { id: tid, role: "tool", content: result, toolName: name }]);
      setStatus(failed ? `${name} failed` : "thinking");
    };
    agent.onStep = (s: number, total: number) => {
      setStep({ cur: s, total });
      setStatus(`step ${s}/${total}`);
    };
    agent.onThought = (content: string) => {
      const preview = content.trim().replace(/\n/g, " ").slice(0, 100);
      if (preview) {
        const tid = `th${Date.now()}`;
        setMessages(p => [...p, { id: tid, role: "system", content: `◐ ${preview}` }]);
      }
    };
    agent.onDone = () => {
      setMessages(p => p.map(m => m.id === aid ? { ...m, pending: false } : m));
    };

    // ── Call agent.run() — the full agent loop with tools ──
    try {
      await agent.run(raw);
    } catch (e: any) {
      const err = e instanceof Error ? e.message : String(e);
      setMessages(p => p.map(m => m.id === aid ? { ...m, content: m.content + `\n\n[ERROR] ${err}`, pending: false } : m));
    } finally {
      setMessages(p => p.map(m => m.id === aid ? { ...m, pending: false } : m));
      setBusy(false);
      setStatus("");
      currentAssistantId.current = null;
    }
  }, [busy, exit]);

  // ── Input handling ──
  useInput((ch, key) => {
    if (busy && !key.ctrl) return;

    if (key.escape) { setInput(""); return; }

    if (suggestions.length > 0) {
      if (key.upArrow) { setSelIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelIdx(i => Math.min(suggestions.length - 1, i + 1)); return; }
      if (key.return) { const s = suggestions[selIdx]; if (s) submit(s.value); return; }
      if (key.tab) { const s = suggestions[selIdx]; if (s) { setInput(s.value + " "); return; } }
    } else {
      if (key.upArrow) { const ni = histIdx === -1 ? history.length - 1 : Math.max(-1, histIdx - 1); setHistIdx(ni); setInput(ni === -1 ? "" : history[ni] ?? ""); return; }
      if (key.downArrow) { const ni = Math.min(history.length, histIdx + 1); setHistIdx(ni); setInput(ni >= history.length ? "" : history[ni] ?? ""); return; }
    }

    if (key.return) { submit(input); return; }
    if (key.backspace || key.delete) { setInput(prev => prev.slice(0, -1)); return; }
    if (key.ctrl && ch === "c") { if (input) setInput(""); else exit(); return; }
    if (ch && !key.ctrl && !key.meta && ch.length === 1) setInput(prev => prev + ch);
  });

  if (!isRawModeSupported) {
    return <Text color="red">Error: Raw mode not supported. Run in a real terminal.</Text>;
  }

  return (
    <Box flexDirection="column">
      {/* Message log */}
      <Box flexDirection="column" flexGrow={1}>
        {messages.map(m => {
          if (m.role === "user") {
            return <Box key={m.id}><Text color="magenta" bold>{"> "}</Text><Text color="white">{m.content}</Text></Box>;
          }
          if (m.role === "system") {
            const isErr = m.content.startsWith("[ERROR") || m.content.startsWith("⚠");
            return <Text key={m.id} color={isErr ? "yellow" : "gray"} dimColor>{m.content}</Text>;
          }
          if (m.role === "tool") {
            const failed = m.content.startsWith("[ERROR]");
            const preview = m.content.replace(/\n/g, " ").slice(0, 100);
            return (
              <Box key={m.id} paddingLeft={2} flexDirection="column">
                <Text><Text color={failed ? "red" : "green"} bold>{failed ? "✗" : "✓"}</Text><Text color="cyan"> {m.toolName}</Text></Text>
                <Text color="gray" dimColor>  {preview}{m.content.length > 100 ? "..." : ""}</Text>
              </Box>
            );
          }
          // assistant — render with markdown
          return (
            <Box key={m.id} flexDirection="column">
              {m.content ? <MessageContent content={m.content} /> : <Text color="gray" dimColor>...</Text>}
              {m.pending && <Text color="magenta">▋</Text>}
            </Box>
          );
        })}
        {busy && <Spinner text={status || "thinking"} />}
      </Box>

      {/* Suggestions */}
      <Suggestions items={suggestions} selected={selIdx} />

      {/* Input box */}
      <Box borderStyle="round" borderColor={busy ? "gray" : "magenta"} paddingX={1}>
        <Text color="magenta" bold>{"> "}</Text>
        <Text color="white">{input}</Text>
        {!busy && <Text color="magenta"> </Text>}
      </Box>

      {/* Footer */}
      <Footer provider={footer.provider} model={footer.model} tokens={tokens} elapsed={elapsed} step={step?.cur} totalSteps={step?.total} />
    </Box>
  );
}
