/**
 * Composer — gemini-cli Composer.tsx pattern.
 *
 * Bottom controls area: input prompt + suggestions + footer.
 * All in a single column Box at the bottom of the screen.
 *
 *   ┌──────────────────────────────────┐
 *   │ [suggestions dropdown — above]  │  ← when input starts with /
 *   │ ╭──────────────────────────────╮ │
 *   │ │ > your input here▋           │ │  ← live input box
 *   │ ╰──────────────────────────────╯ │
 *   │ [suggestions dropdown — below]  │  ← fallback for narrow terminals
 *   │ ~/axoniz · main · trusted ·     │
 *   │ orca/glm-5.3-flash-free · 1.2k  │  ← multi-column footer
 *   └──────────────────────────────────┘
 */
import React from "react";
import { Box, Text } from "ink";
import { InputPrompt } from "./InputPrompt.js";
import { Footer, type FooterData } from "./Footer.js";
import type { SlashCommand } from "./SuggestionsDisplay.js";

interface Props {
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
  disabled: boolean;
  footer: FooterData;
}

export function Composer(props: Props) {
  const terminalWidth = (process.stdout as unknown as { columns?: number }).columns ?? 100;
  return (
    <Box flexDirection="column" width={terminalWidth} flexShrink={0}>
      <InputPrompt
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
        disabled={props.disabled}
        suggestionsPosition="above"
      />
      <Footer data={props.footer} terminalWidth={terminalWidth} />
    </Box>
  );
}
