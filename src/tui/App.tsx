/**
 * AXONIZ TUI — clean, working Ink-based terminal interface.
 * Uses AXONIZ's real agent.chatStream(), real slash commands,
 * real provider/model switching. No mocks.
 *
 * Components:
 *   - InputPrompt: live input box with cursor + slash suggestions
 *   - MessageLog: conversation history with inline markdown
 *   - Footer: provider/model/tokens/elapsed
 *   - Spinner: animated braille dots
 *   - Suggestions: slash command dropdown
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";
import { createAgent, getProviderInfo, PROVIDER_CATALOG } from "./lib/agent-bridge.js";
import { SLASH_COMMANDS, handleSlash } from "./lib/slash-commands.js";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
}

function Spinner({ text }: { text: string }) {
  const [f, setF] = useState(0);
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  useEffect(() => {
    const id = setInterval(() => setF(i => (i + 1) % frames.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="magenta">{frames[f]} {text}</Text>;
}

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

function Footer({ provider, model, tokens, elapsed }: { provider: string; model: string; tokens: number; elapsed: number }) {
  const tok = tokens > 0 ? `${tokens > 999 ? (tokens / 1000).toFixed(1) + "k" : tokens} tok` : "—";
  const el = elapsed > 0 ? `${elapsed}s` : "";
  return (
    <Box justifyContent="space-between">
      <Text color="gray"><Text color="magenta">◈</Text> {provider}<Text color="gray">/</Text><Text color="cyan">{model}</Text></Text>
      <Text color="gray">{tok}{el ? ` · ${el}` : ""}</Text>
    </Box>
  );
}

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
  const [footer, setFooter] = useState({ provider: "axoniz", model: "auto" });
  const elapsedStart = useRef<number | null>(null);

  // Init agent + footer
  useEffect(() => {
    const args = process.argv.slice(2);
    let prov: string | undefined;
    for (let i = 0; i < args.length; i++) if (args[i] === "--provider" && args[i + 1]) { prov = args[i + 1]; break; }
    try {
      agentRef.current = createAgent(prov);
      const info = getProviderInfo(agentRef.current);
      setFooter({ provider: info.provider, model: info.model });

      // API key warning
      const meta = PROVIDER_CATALOG.find(p => p.id === info.provider);
      if (meta?.needsApiKey && !info.hasKey) {
        const envKey = `${info.provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
        setMessages([{
          id: "warn",
          role: "system",
          content: `⚠ No API key for ${info.provider}. Set: ${envKey}=<key>`,
        }]);
      }
    } catch (e) {
      setMessages([{ id: "err", role: "system", content: `Failed to init: ${e instanceof Error ? e.message : String(e)}` }]);
    }
  }, []);

  // Timer
  useEffect(() => {
    if (!busy) { elapsedStart.current = null; return; }
    elapsedStart.current = Date.now();
    const id = setInterval(() => {
      if (elapsedStart.current) setElapsed(Math.floor((Date.now() - elapsedStart.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Slash suggestions
  const suggestions = input.startsWith("/") && !input.includes(" ")
    ? SLASH_COMMANDS.filter(c => c.value.startsWith(input))
    : [];
  const [selIdx, setSelIdx] = useState(0);
  useEffect(() => setSelIdx(0), [input]);

  const submit = useCallback(async (raw: string) => {
    if (raw === "exit" || raw === "quit") { exit(); return; }
    if (!raw.trim() || busy) return;

    // Shell command
    if (raw.startsWith("!")) {
      const cmd = raw.slice(1).trim();
      setMessages(prev => [...prev, { id: `u${Date.now()}`, role: "user", content: raw }]);
      setHistory(h => [...h, raw]); setInput("");
      try {
        const out = require("child_process").execSync(cmd, { encoding: "utf-8", timeout: 30000, maxBuffer: 1024*1024*2 });
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: "assistant", content: out || "(no output)" }]);
      } catch (e: any) {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: "assistant", content: `[ERROR] ${e.message ?? e}` }]);
      }
      return;
    }

    // File mention
    if (raw.startsWith("@")) {
      const fp = raw.slice(1).trim();
      setMessages(prev => [...prev, { id: `u${Date.now()}`, role: "user", content: raw }]);
      setHistory(h => [...h, raw]); setInput("");
      try {
        const content = require("fs").readFileSync(fp, "utf-8");
        const preview = content.length > 2000 ? content.slice(0, 2000) + "..." : content;
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: "assistant", content: preview }]);
      } catch (e: any) {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: "assistant", content: `[ERROR] ${e.message ?? e}` }]);
      }
      return;
    }

    // Slash command
    if (raw.startsWith("/")) {
      setMessages(prev => [...prev, { id: `u${Date.now()}`, role: "user", content: raw }]);
      setHistory(h => [...h, raw]); setInput("");
      setBusy(true); setElapsed(0);
      const aid = `a${Date.now()}`;
      setMessages(prev => [...prev, { id: aid, role: "assistant", content: "", pending: true }]);
      try {
        const result = await handleSlash(raw, agentRef.current);
        if (result.action === "clear") { setMessages([]); setBusy(false); return; }
        if (result.action === "exit") { exit(); return; }
        if (result.newFooter) setFooter(f => ({ ...f, ...result.newFooter }));
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: result.output ?? "(no output)", pending: false } : m));
      } catch (e: any) {
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `[ERROR] ${e.message ?? e}`, pending: false } : m));
      }
      setBusy(false);
      return;
    }

    // Regular chat → real AXONIZ agent.chatStream()
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: "user", content: raw }]);
    setHistory(h => [...h, raw]); setInput("");
    setBusy(true); setElapsed(0); setTokens(0);

    const aid = `a${Date.now()}`;
    setMessages(prev => [...prev, { id: aid, role: "assistant", content: "", pending: true }]);

    let tokenCount = 0;
    try {
      const agent = agentRef.current;
      for await (const token of agent.chatStream(raw)) {
        tokenCount += token.length;
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: m.content + token } : m));
        setTokens(tokenCount);
      }
    } catch (e: any) {
      const err = e instanceof Error ? e.message : String(e);
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `[ERROR] ${err}`, pending: false } : m));
    } finally {
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, pending: false } : m));
      setBusy(false);
    }
  }, [busy, exit]);

  useInput((ch, key) => {
    if (busy && !key.ctrl) return;

    if (key.escape) { setInput(""); return; }

    // Suggestions navigation
    if (suggestions.length > 0) {
      if (key.upArrow) { setSelIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelIdx(i => Math.min(suggestions.length - 1, i + 1)); return; }
      if (key.return) {
        const s = suggestions[selIdx];
        if (s) submit(s.value);
        return;
      }
      if (key.tab) {
        const s = suggestions[selIdx];
        if (s) { setInput(s.value + " "); return; }
      }
    } else {
      if (key.upArrow) { const ni = histIdx === -1 ? history.length - 1 : Math.max(-1, histIdx - 1); setHistIdx(ni); setInput(ni === -1 ? "" : history[ni] ?? ""); return; }
      if (key.downArrow) { const ni = Math.min(history.length, histIdx + 1); setHistIdx(ni); setInput(ni >= history.length ? "" : history[ni] ?? ""); return; }
    }

    if (key.return) { submit(input); return; }

    if (key.backspace || key.delete) { setInput(input.slice(0, -1)); return; }

    if (key.ctrl && ch === "c") {
      if (input) setInput("");
      else exit();
      return;
    }

    if (ch && !key.ctrl && !key.meta && ch.length === 1) setInput(input + ch);
  });

  if (!isRawModeSupported) {
    return <Text color="red">Error: Raw mode not supported. Run in a real terminal.</Text>;
  }

  return (
    <Box flexDirection="column" minHeight={3}>
      {/* Message log */}
      <Box flexDirection="column" flexGrow={1}>
        {messages.map(m => (
          <Box key={m.id} flexDirection="column">
            {m.role === "user" ? (
              <Text><Text color="magenta" bold>{"> "}</Text><Text color="white">{m.content}</Text></Text>
            ) : m.role === "system" ? (
              <Text color={m.content.startsWith("⚠") || m.content.startsWith("[ERROR") ? "yellow" : "gray"}>{m.content}</Text>
            ) : (
              <Text color="gray">{m.content || "..."}</Text>
            )}
            {m.pending && m.role === "assistant" && <Text color="magenta">▋</Text>}
          </Box>
        ))}
        {busy && <Spinner text="thinking" />}
      </Box>

      {/* Suggestions */}
      <Suggestions items={suggestions} selected={selIdx} />

      {/* Input box */}
      <Box borderStyle="round" borderColor={busy ? "gray" : "magenta"} paddingX={1}>
        <Text color="magenta" bold>{"> "}</Text>
        <Text color="white">{input}</Text>
        {!busy && <Text color="magenta">{" "}</Text>}
      </Box>

      {/* Footer */}
      <Footer provider={footer.provider} model={footer.model} tokens={tokens} elapsed={elapsed} />
    </Box>
  );
}
