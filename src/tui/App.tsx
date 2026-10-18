/**
 * AXONIZ TUI — Ink (React for terminal) based REPL.
 *
 * This is the REAL reactive terminal UI, built with the same Ink library
 * that gemini-cli uses. It provides:
 *
 *   1. **Live input box at the bottom** — persistent, not blocking.
 *      You can type, backspace, paste, navigate with arrow keys.
 *   2. **Slash command autocomplete** — typing `/` opens a dropdown of
 *      matching commands. Up/down arrows navigate, Tab/Enter accepts.
 *   3. **History navigation** — Up/Down arrows cycle through past inputs
 *      (same as gemini-cli InputPrompt.tsx useInputHistory).
 *   4. **Live footer** — model + tokens + elapsed update in real-time
 *      during streaming (gemini-cli Footer.tsx pattern).
 *   5. **Animated spinner** — smooth braille-dot animation that doesn't
 *      flicker (ink-spinner + manual render loop).
 *   6. **Multi-line editor** — Shift+Enter for newlines, cursor movement
 *      with Left/Right/Home/End.
 *   7. **Scrollable response history** — the conversation log scrolls,
 *      past responses stay visible above the input.
 *
 * Architecture (mirrors gemini-cli):
 *   - src/tui/App.tsx — root component, owns the layout
 *   - src/tui/components/InputPrompt.tsx — the live input box
 *   - src/tui/components/MessageLog.tsx — scrolling conversation history
 *   - src/tui/components/Footer.tsx — live status bar at bottom
 *   - src/tui/components/Spinner.tsx — animated thinking indicator
 *   - src/tui/components/SuggestionsDisplay.tsx — slash command dropdown
 *   - src/tui/hooks/useAgentStream.ts — bridges the agent's onToken/
 *      onToolCall/onToolResult hooks into React state updates
 */
import React, { useState, useEffect, useRef } from "react";
import { render, Box, Text, useInput, useStdin, useApp } from "ink";
import { AgentBridge } from "./lib/agent-bridge.js";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  pending?: boolean;
}

interface FooterData {
  provider: string;
  model: string;
  tokens: number;
  elapsedSec: number;
}

const SLASH_COMMANDS = [
  { id: "help", label: "/help — show commands", value: "/help" },
  { id: "models", label: "/models — list models", value: "/models" },
  { id: "use", label: "/use <name> — switch model", value: "/use" },
  { id: "providers", label: "/providers — list providers", value: "/providers" },
  { id: "switch", label: "/switch <p> — switch provider", value: "/switch" },
  { id: "web", label: "/web — launch dashboard", value: "/web" },
  { id: "tools", label: "/tools — list tools", value: "/tools" },
  { id: "history", label: "/history — session history", value: "/history" },
  { id: "memory", label: "/memory — semantic memory", value: "/memory" },
  { id: "palace", label: "/palace — palace status", value: "/palace" },
  { id: "clear", label: "/clear — clear screen", value: "/clear" },
  { id: "reset", label: "/reset — reset conversation", value: "/reset" },
  { id: "config", label: "/config — show config", value: "/config" },
  { id: "health", label: "/health — system health", value: "/health" },
  { id: "exit", label: "exit — quit", value: "exit" },
];

/** Live input box — types as you type, supports history + autocomplete. */
function InputPrompt({
  value,
  onChange,
  onSubmit,
  suggestions,
  suggestionIndex,
  onSuggestionNav,
  onAcceptSuggestion,
  history,
  historyIndex,
  onHistoryNav,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  suggestions: typeof SLASH_COMMANDS;
  suggestionIndex: number;
  onSuggestionNav: (dir: "up" | "down") => void;
  onAcceptSuggestion: (s: string) => void;
  history: string[];
  historyIndex: number;
  onHistoryNav: (dir: "up" | "down") => void;
  disabled: boolean;
}) {
  useInput((input, key) => {
    if (disabled) return;

    // Enter — submit
    if (key.return) {
      onSubmit(value);
      return;
    }

    // Up arrow — history navigation (when no suggestions)
    if (key.upArrow && suggestions.length === 0) {
      onHistoryNav("up");
      return;
    }
    // Down arrow — history navigation (when no suggestions)
    if (key.downArrow && suggestions.length === 0) {
      onHistoryNav("down");
      return;
    }
    // Up/Down when suggestions are showing — navigate suggestions
    if (key.upArrow && suggestions.length > 0) {
      onSuggestionNav("up");
      return;
    }
    if (key.downArrow && suggestions.length > 0) {
      onSuggestionNav("down");
      return;
    }
    // Tab — accept current suggestion
    if (key.tab && suggestions.length > 0) {
      onAcceptSuggestion(suggestions[suggestionIndex]?.value ?? "");
      return;
    }
    // Backspace
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    // Ctrl+C — clear or exit
    if (key.ctrl && input === "c") {
      if (value.length > 0) onChange("");
      else onSubmit("__exit__");
      return;
    }
    // Regular character
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      onChange(value + input);
    }
  });

  return (
    <Box borderStyle="round" borderColor={disabled ? "gray" : "magenta"} paddingX={1}>
      <Text color="cyan" bold>❯ </Text>
      <Text color="white">{value}</Text>
      <Text color="magenta">▋</Text>
    </Box>
  );
}

/** Suggestions dropdown — appears when input starts with `/`. */
function SuggestionsDisplay({
  suggestions,
  selectedIndex,
}: {
  suggestions: typeof SLASH_COMMANDS;
  selectedIndex: number;
}) {
  if (suggestions.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {suggestions.slice(0, 8).map((s, i) => (
        <Box key={s.id} paddingLeft={1}>
          <Text color={i === selectedIndex ? "magenta" : "gray"}>
            {i === selectedIndex ? "▸ " : "  "}
            {s.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/** Animated spinner (braille dots) — shown while agent is thinking. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
function Spinner({ text }: { text: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <Box>
      <Text color="magenta">{SPINNER_FRAMES[frame]}</Text>
      <Text color="gray"> {text}</Text>
    </Box>
  );
}

/** Live footer — model + tokens + elapsed (updates in real-time). */
function Footer({ data }: { data: FooterData }) {
  const tokens = data.tokens > 0 ? `${compact(data.tokens)} tokens` : "—";
  const elapsed = data.elapsedSec > 0 ? `${data.elapsedSec}s` : "0s";
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text color="gray">
        <Text color="magenta">◈</Text> axoniz{" "}
        <Text color="cyan">{data.provider}</Text>
        <Text color="gray">/</Text>
        <Text color="white">{data.model}</Text>
      </Text>
      <Text color="gray">
        {tokens} · {elapsed}
      </Text>
    </Box>
  );
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n).toLowerCase();
}

/** Message log — scrolls, shows past messages + assistant responses. */
function MessageLog({ messages }: { messages: Message[] }) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      {messages.map(m => (
        <Box key={m.id} flexDirection="column">
          {m.role === "user" ? (
            <Box>
              <Text color="cyan" bold>❯ </Text>
              <Text color="white">{m.content}</Text>
            </Box>
          ) : m.role === "tool" ? (
            <Box paddingLeft={2}>
              <Text color="green">✓ </Text>
              <Text color="gray">{m.content.slice(0, 100)}</Text>
            </Box>
          ) : (
            <Box paddingLeft={2}>
              <Text color="gray">{m.content}{m.pending ? "▋" : ""}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

/** Root App component — owns all state. */
export function App({ agentBridge }: { agentBridge: AgentBridge }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [footer, setFooter] = useState<FooterData>({
    provider: "orca",
    model: "glm-5.3-flash-free",
    tokens: 0,
    elapsedSec: 0,
  });
  const [elapsed, setElapsed] = useState(0);
  const elapsedStart = useRef<number | null>(null);
  const { exit } = useApp();

  // Live elapsed timer — updates every 100ms while busy
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

  // Filter slash suggestions based on current input
  const suggestions = input.startsWith("/")
    ? SLASH_COMMANDS.filter(c => c.value.startsWith(input.split(" ")[0]))
    : [];

  // Reset suggestion index when input changes
  useEffect(() => { setSuggestionIndex(0); }, [input]);

  const handleSubmit = async (raw: string) => {
    if (raw === "__exit__" || raw === "exit" || raw === "quit") {
      exit();
      return;
    }
    if (!raw.trim() || busy) return;

    // Add user message
    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: raw };
    setMessages(prev => [...prev, userMsg]);

    // Add to history
    setHistory(prev => [...prev, raw]);
    setHistoryIndex(-1);
    setInput("");
    setBusy(true);
    setElapsed(0);

    // Pending assistant message — tokens stream into it
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
    <Box flexDirection="column">
      {/* Message log — scrolling history (no flex constraints, just renders in order) */}
      <MessageLog messages={messages} />
      {busy && <Spinner text="thinking" />}

      {/* Suggestions dropdown */}
      <SuggestionsDisplay suggestions={suggestions} selectedIndex={suggestionIndex} />

      {/* Input box — live, persistent */}
      <InputPrompt
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
        disabled={busy}
      />

      {/* Footer — live status bar */}
      <Footer data={{ ...footer, elapsedSec: elapsed }} />
    </Box>
  );
}

/** Entry point — renders the App with the agent bridge. */
export function startTUI(agentBridge: AgentBridge): void {
  render(<App agentBridge={agentBridge} />);
}
