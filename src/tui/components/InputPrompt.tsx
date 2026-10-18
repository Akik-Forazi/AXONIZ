/**
 * InputPrompt — gemini-cli InputPrompt.tsx pattern.
 *
 * The live input box at the bottom of the screen. Features:
 *
 *   - Persistent: not blocking like readline.question()
 *   - Type as you go — every keystroke triggers a React state update
 *     via onChange, which causes Ink to re-render the prompt + cursor
 *   - `>` prefix (matches gemini-cli's prompt char)
 *   - Live cursor block `▋` after the input
 *   - Up/Down arrow history navigation (cycles through past inputs)
 *   - Tab to accept current slash suggestion
 *   - Up/Down with suggestions open → navigate suggestions instead
 *   - Ctrl-C: clear input if non-empty, exit if empty
 *   - `!` prefix → shell mode (gemini-cli `!command` pattern)
 *   - `@` prefix → file mention (gemini-cli `@file` pattern, future)
 *
 * Border: rounded magenta when focused, gray when disabled (during streaming).
 */
import React from "react";
import { Box, Text, useInput } from "ink";
import { SuggestionsDisplay, type SlashCommand } from "./SuggestionsDisplay.js";

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
  placeholder?: string;
  suggestionsPosition?: "above" | "below";
}

export function InputPrompt({
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
  placeholder = "  Type your message or @path/to/file",
  suggestionsPosition = "below",
}: Props) {
  useInput((input, key) => {
    if (disabled) return;

    // Up/Down when suggestions are showing → navigate suggestions
    // AND update the input box to match the highlighted suggestion,
    // so when Enter is pressed, the input has the full command (was
    // sending just "/" because the input box never updated as user
    // navigated the dropdown — bug fix).
    if (suggestions.length > 0) {
      if (key.upArrow) {
        onSuggestionNav("up");
        // Sync input to the new selection
        const newIndex = Math.max(0, suggestionIndex - 1);
        const newSel = suggestions[newIndex];
        if (newSel) onChange(newSel.value + " ");
        return;
      }
      if (key.downArrow) {
        onSuggestionNav("down");
        const newIndex = Math.min(suggestions.length - 1, suggestionIndex + 1);
        const newSel = suggestions[newIndex];
        if (newSel) onChange(newSel.value + " ");
        return;
      }
    } else {
      // Up/Down with no suggestions → history navigation
      if (key.upArrow) { onHistoryNav("up"); return; }
      if (key.downArrow) { onHistoryNav("down"); return; }
    }

    // Enter — submit. If suggestions are showing AND the current input
    // is a partial match for the highlighted suggestion, accept it first
    // (so user can type "/" → arrow down → Enter to submit the command).
    if (key.return) {
      if (suggestions.length > 0 && suggestions[suggestionIndex]) {
        const sel = suggestions[suggestionIndex];
        // Only auto-accept if the input is a prefix of the suggestion
        if (sel.value.startsWith(value.trim()) || value.trim().startsWith(sel.value)) {
          onSubmit(sel.value);
          return;
        }
      }
      onSubmit(value);
      return;
    }

    // Tab — accept current suggestion (explicit)
    if (key.tab && suggestions.length > 0) {
      const s = suggestions[suggestionIndex];
      if (s) onAcceptSuggestion(s.value);
      return;
    }
    // Backspace
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    // Ctrl-C — clear input or exit
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

  const showPlaceholder = value.length === 0 && !disabled;

  return (
    <Box flexDirection="column">
      {suggestionsPosition === "above" && suggestions.length > 0 && (
        <SuggestionsDisplay
          suggestions={suggestions}
          selectedIndex={suggestionIndex}
          position="above"
        />
      )}
      <Box
        borderStyle="round"
        borderColor={disabled ? "gray" : "magenta"}
        paddingX={1}
      >
        <Text color="magenta" bold>{"> "}</Text>
        {showPlaceholder ? (
          <Text color="gray" dimColor>{placeholder}</Text>
        ) : (
          <Text color="white">{value}</Text>
        )}
        {!disabled && <Text color="magenta">▋</Text>}
      </Box>
      {suggestionsPosition === "below" && suggestions.length > 0 && (
        <SuggestionsDisplay
          suggestions={suggestions}
          selectedIndex={suggestionIndex}
          position="below"
        />
      )}
    </Box>
  );
}
