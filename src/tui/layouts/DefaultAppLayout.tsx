/**
 * DefaultAppLayout — gemini-cli DefaultAppLayout.tsx pattern.
 *
 * Root layout. Two stacked areas:
 *   1. MainContent (top, flexGrow=1 — takes all remaining vertical space)
 *      - Header (banner + version + tips)
 *      - Message log (scrolling conversation history)
 *   2. Composer (bottom, flexShrink=0 — fixed height)
 *      - InputPrompt (live input box)
 *      - Footer (multi-column status bar)
 *
 * Same flex layout as gemini-cli — main content scrolls, controls stay
 * pinned at the bottom.
 */
import React from "react";
import { Box } from "ink";
import { MainContent, type Message } from "../components/MainContent.js";
import { Composer } from "../components/Composer.js";
import { Footer, type FooterData } from "../components/Footer.js";
import type { SlashCommand } from "../components/SuggestionsDisplay.js";

interface Props {
  messages: Message[];
  busy: boolean;
  version: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  suggestions: SlashCommand[];
  suggestionIndex: number;
  onSuggestionNav: (dir: "up" | "down") => void;
  onAcceptSuggestion: (s: string) => void;
  history: string[];
  historyIndex: number;
  onHistoryNav: (dir: "up" | "down") => void;
  footer: FooterData;
}

export function DefaultAppLayout(props: Props) {
  const stdoutAny = process.stdout as unknown as { columns?: number; rows?: number };
  const terminalWidth = stdoutAny.columns ?? 100;
  const terminalHeight = stdoutAny.rows ?? 40;
  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      height={terminalHeight}
      flexShrink={0}
      flexGrow={0}
    >
      {/* MainContent — scrollable top half */}
      <MainContent
        messages={props.messages}
        busy={props.busy}
        version={props.version}
      />
      {/* Composer — fixed bottom controls */}
      <Composer
        value={props.value}
        onChange={props.onChange}
        onSubmit={props.onSubmit}
        suggestions={props.suggestions}
        suggestionIndex={props.suggestionIndex}
        onSuggestionNav={props.onSuggestionNav}
        onAcceptSuggestion={props.onAcceptSuggestion}
        history={props.history}
        historyIndex={props.historyIndex}
        onHistoryNav={props.onHistoryNav}
        disabled={props.busy}
        footer={props.footer}
      />
    </Box>
  );
}
