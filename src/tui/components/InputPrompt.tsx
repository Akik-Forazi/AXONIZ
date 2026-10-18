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
    // (don't auto-sync the input box — that would re-filter the list
    // and collapse it to 1 item. Just move the ▸ highlight.)
    if (suggestions.length > 0) {
      if (key.upArrow) { onSuggestionNav("up"); return; }
      if (key.downArrow) { onSuggestionNav("down"); return; }
    } else {
      // Up/Down with no suggestions → history navigation
      if (key.upArrow) { onHistoryNav("up"); return; }
      if (key.downArrow) { onHistoryNav("down"); return; }
    }

    // Enter — submit. If suggestions are showing, submit the HIGHLIGHTED
    // suggestion (so user can type "/" → ↓ ↓ ↓ → Enter to pick the 4th
    // command). Otherwise submit the current input text.
    if (key.return) {
      if (suggestions.length > 0 && suggestions[suggestionIndex]) {
        onSubmit(suggestions[suggestionIndex].value);
        return;
      }
      onSubmit(value);
      return;
    }

    // Tab — accept current suggestion into the input box (so user can
    // add args, e.g. /switch<Tab> → input becomes "/switch " ready for args)
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
