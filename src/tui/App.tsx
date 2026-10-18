/**
 * AXONIZ TUI — root App component.
 *
 * Mirrors gemini-cli's App.tsx — owns all state and renders DefaultAppLayout.
 *
 * State owned here:
 *   - input (current text in the input box)
 *   - messages (conversation history: user + assistant + tool)
 *   - history (past user inputs for up/down navigation)
 *   - busy (whether agent is streaming)
 *   - footer (live status data: model + tokens + elapsed)
 *
 * The agent bridge (AgentBridge) is injected from entry.tsx so we can swap
 * mock vs real without touching this file.
 */
import React, { useState, useEffect, useRef } from "react";
import { useApp } from "ink";
import { DefaultAppLayout } from "./layouts/DefaultAppLayout.js";
import { Footer, type FooterData } from "./components/Footer.js";
import type { Message } from "./components/MainContent.js";
import type { SlashCommand } from "./components/SuggestionsDisplay.js";
import type { AgentBridge } from "./lib/agent-bridge.js";
import { handleSlashCommand } from "./lib/slash-commands.js";
import { getAgent } from "./lib/agent-bridge.js";

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "help", value: "/help", label: "/help", description: "Show this help" },
  { id: "models", value: "/models", label: "/models", description: "List all available models" },
  { id: "use", value: "/use", label: "/use", description: "Switch model" },
  { id: "providers", value: "/providers", label: "/providers", description: "List supported providers" },
  { id: "switch", value: "/switch", label: "/switch", description: "Switch provider live" },
  { id: "web", value: "/web", label: "/web", description: "Launch the web dashboard" },
  { id: "tools", value: "/tools", label: "/tools", description: "List available agent tools" },
  { id: "history", value: "/history", label: "/history", description: "Show conversation history" },
  { id: "memory", value: "/memory", label: "/memory", description: "Show semantic memory" },
  { id: "palace", value: "/palace", label: "/palace", description: "Palace status" },
  { id: "clear", value: "/clear", label: "/clear", description: "Clear screen" },
  { id: "reset", value: "/reset", label: "/reset", description: "Reset conversation" },
  { id: "config", value: "/config", label: "/config", description: "Show active config" },
  { id: "health", value: "/health", label: "/health", description: "System health report" },
  { id: "exit", value: "exit", label: "exit", description: "Quit" },
];

interface AppProps {
  agentBridge: AgentBridge;
  version?: string;
  initialFooter?: Partial<FooterData>;
  cwd?: string;
}

export function App({
  agentBridge,
  version = "0.1.8",
  initialFooter = { provider: "axoniz", model: "auto", tokens: 0, elapsedSec: 0, cwd: process.cwd(), gitBranch: null, isTrusted: true },
  cwd,
}: AppProps) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [footer, setFooter] = useState<FooterData>({
    cwd: cwd ?? process.cwd(),
    gitBranch: null,
    model: initialFooter.model ?? "auto",
    provider: initialFooter.provider ?? "axoniz",
    tokens: 0,
    elapsedSec: 0,
    isTrusted: true,
  });
  const elapsedStart = useRef<number | null>(null);

  // Live elapsed timer — updates every 1s while busy
  useEffect(() => {
    if (!busy) {
      elapsedStart.current = null;
      return;
    }
    elapsedStart.current = Date.now();
    const id = setInterval(() => {
      if (elapsedStart.current) setElapsed(Math.floor((Date.now() - elapsedStart.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Filter slash suggestions based on input
  const suggestions = input.startsWith("/")
    ? SLASH_COMMANDS.filter(c => c.value.startsWith(input.split(" ")[0]))
    : [];
  useEffect(() => { setSuggestionIndex(0); }, [input]);

  const handleSubmit = async (raw: string) => {
    if (raw === "__exit__" || raw === "exit" || raw === "quit") {
      exit();
      return;
    }
    if (!raw.trim() || busy) return;

    // ── Slash command interception ──
    // If input starts with /, run it locally instead of sending to the LLM.
    // The result is rendered as an assistant message (or special action).
    if (raw.trim().startsWith("/")) {
      const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: raw };
      setMessages(prev => [...prev, userMsg]);
      setHistory(prev => [...prev, raw]);
      setHistoryIndex(-1);
      setInput("");

      const assistantId = `a${Date.now()}`;
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", pending: true }]);
      setBusy(true);
      setElapsed(0);

      try {
        const agent = getAgent();
        const result = await handleSlashCommand(raw, { agent, cwd: footer.cwd });
        let output: string;
        if (result === "__clear__") {
          setMessages([]);
          setBusy(false);
          return;
        }
        if (result === "__exit__") {
          exit();
          return;
        }
        output = result ?? "(no output)";
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: output, pending: false } : m));
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `[ERROR] ${err}`, pending: false } : m));
      } finally {
        setBusy(false);
      }
      return;
    }

    // ── Regular chat — send to the LLM ──
    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: raw };
    setMessages(prev => [...prev, userMsg]);

    setHistory(prev => [...prev, raw]);
    setHistoryIndex(-1);
    setInput("");
    setBusy(true);
    setElapsed(0);

    const assistantId = `a${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", pending: true }]);

    let tokenCount = 0;
    await agentBridge.exec(
      raw,
      (token) => {
        tokenCount += token.length;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m));
        setFooter(f => ({ ...f, tokens: tokenCount }));
      },
      () => {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, pending: false } : m));
        setBusy(false);
        setFooter(f => ({ ...f, elapsedSec: elapsed, tokens: tokenCount }));
      },
    );
  };

  const onSuggestionNav = (dir: "up" | "down") => {
    setSuggestionIndex(i => {
      if (dir === "up") return Math.max(0, i - 1);
      return Math.min(suggestions.length - 1, i + 1);
    });
  };

  const onHistoryNav = (dir: "up" | "down") => {
    if (history.length === 0) return;
    let newIdx = historyIndex === -1 ? history.length - 1 : historyIndex + (dir === "up" ? -1 : 1);
    newIdx = Math.max(-1, Math.min(history.length - 1, newIdx));
    setHistoryIndex(newIdx);
    setInput(newIdx === -1 ? "" : history[newIdx]);
  };

  return (
    <DefaultAppLayout
      messages={messages}
      busy={busy}
      version={version}
      value={input}
      onChange={setInput}
      onSubmit={handleSubmit}
      suggestions={suggestions}
      suggestionIndex={suggestionIndex}
      onSuggestionNav={onSuggestionNav}
      onAcceptSuggestion={(s) => setInput(s + " ")}
      history={history}
      historyIndex={historyIndex}
      onHistoryNav={onHistoryNav}
      footer={{ ...footer, elapsedSec: elapsed }}
    />
  );
}
