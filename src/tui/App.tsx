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
import { handleInput, type SlashResult } from "./lib/slash-commands.js";
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
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
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
  const sessionStart = useRef(Date.now());

  // ── On startup, read real provider + model from the agent config ──
  // (was showing "axoniz/auto" because initialFooter defaults were wrong)
  useEffect(() => {
    try {
      const agent = getAgent();
      const cfg = agent.config as Record<string, unknown>;
      const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
      const prov = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
      const pCfg = llm?.providers?.[prov] ?? {};
      const model = String(pCfg.model_name ?? pCfg.model_path ?? cfg.model_name ?? "auto");
      const modelShort = model.split(/[\\/]/).pop()?.replace(/\.(gguf|bin)$/i, "") ?? model;
      setFooter(f => ({ ...f, provider: prov, model: modelShort }));

      // ── API key check — warn the user if the provider needs a key but
      // doesn't have one (so the first message doesn't fail silently)
      const CLOUD = ["orca", "openrouter", "openai", "anthropic", "gemini", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity"];
      if (CLOUD.includes(prov) && !pCfg.api_key) {
        const envKey = `${prov.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
        const envVal = process.env[envKey] ?? process.env[`${prov}_API_KEY`];
        if (!envVal) {
          setMessages([{
            id: "warn-apikey",
            role: "assistant",
            content: `⚠ No API key configured for **${prov}**.\n\nSet it with:\n\`\`\`bash\nexport ${envKey}=your-key-here\n\`\`\`\n\nOr restart with: \`node dist/tui/entry.js --provider ${prov}\`\nafter setting the env var.\n\nOr switch to a local provider: \`/switch lmstudio\``,
          }]);
        }
      }
    } catch {
      // Agent might not be ready yet — skip
    }
  }, []);

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

  const [mode, setMode] = useState<"agent" | "chat" | "goal">("agent");

  const handleSubmit = async (raw: string) => {
    if (raw === "__exit__" || raw === "exit" || raw === "quit") {
      const sessionElapsed = Math.floor((Date.now() - sessionStart.current) / 1000);
      setMessages(prev => [...prev, {
        id: "exit-summary",
        role: "assistant",
        content: `**Session summary**\n\n- Messages: ${messageCount}\n- Total tokens: ${totalTokens}\n- Session time: ${sessionElapsed}s\n- Provider: ${footer.provider}/${footer.model}\n\nBye. ◈`,
      }]);
      setTimeout(() => exit(), 500);
      return;
    }
    if (!raw.trim() || busy) return;

    // ── Intercept / ! @ commands BEFORE sending to LLM ──
    if (raw.trim().startsWith("/") || raw.trim().startsWith("!") || raw.trim().startsWith("@")) {
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
        const result: SlashResult = await handleInput(raw, { agent, cwd: footer.cwd });

        // Handle special actions
        if (result.action === "clear") {
          setMessages([]);
          setBusy(false);
          return;
        }
        if (result.action === "exit") {
          const sessionElapsed = Math.floor((Date.now() - sessionStart.current) / 1000);
          setMessages([{ id: "exit", role: "assistant", content: `**Bye.** ◈\n\n- Messages: ${messageCount}\n- Tokens: ${totalTokens}\n- Time: ${sessionElapsed}s` }]);
          setTimeout(() => exit(), 500);
          setBusy(false);
          return;
        }
        if (result.action === "update-footer" && result.newFooter) {
          setFooter(f => ({ ...f, provider: result.newFooter!.provider ?? f.provider, model: result.newFooter!.model ?? f.model }));
        }
        if (result.action === "launch-web") {
          // Spawn web dashboard in background
          try {
            const { spawnWebOnPort } = await import("../web/web-spawn.js");
            const result2 = await spawnWebOnPort(7860);
            if (result2) {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `**Web dashboard launched:** ${result2!.url}\n\nOpening in your browser...`, pending: false } : m));
            } else {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: "Failed to launch web dashboard. Run `axoniz --web` from the CLI.", pending: false } : m));
            }
          } catch (e) {
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Web launch failed: ${e instanceof Error ? e.message : String(e)}`, pending: false } : m));
          }
          setBusy(false);
          return;
        }
        if (result.action === "set-mode" && result.mode) {
          setMode(result.mode);
        }

        // Render the output text
        const output = result.output ?? "(no output)";
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
    setMessageCount(c => c + 1);
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
        setTotalTokens(t => t + token.length);
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m));
        setFooter(f => ({ ...f, tokens: tokenCount }));
      },
      () => {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, pending: false } : m));
        setBusy(false);
        setTotalElapsed(t => t + elapsed);
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
