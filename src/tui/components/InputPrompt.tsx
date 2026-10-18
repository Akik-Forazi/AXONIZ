/**
 * InputPrompt — gemini-cli InputPrompt.tsx pattern.
 *
 * The live input box at the bottom. Features:
 *
 *   - Persistent: not blocking like readline.question()
 *   - Type as you go — every keystroke triggers onChange → re-render
 *   - `>` prefix (gemini-cli pattern)
 *   - Live cursor `▋` after the input
 *   - Up/Down: history nav (no suggestions) or suggestion nav (suggestions)
 *   - Left/Right: cursor movement within the input
 *   - Home/End (Ctrl+A/Ctrl+E): jump to start/end
 *   - Ctrl+W: delete previous word
 *   - Ctrl+U: delete from cursor to start
 *   - Ctrl+K: delete from cursor to end
 *   - Esc: clear input (dismisses suggestions + clears text)
 *   - Tab: accept suggestion into input (for adding args)
 *   - Enter: submit (highlighted suggestion if dropdown open, else input)
 *   - Ctrl-C: clear input if non-empty, exit if empty
 */
import React, { useState } from "react";
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
  // Cursor position within the input string — for Left/Right/Home/End
  const [cursor, setCursor] = useState(value.length);

  // Keep cursor at end when value changes externally (e.g. history nav, suggestion accept)
  React.useEffect(() => {
    setCursor(value.length);
  }, [value]);

  // Helper: update both value and cursor together
  const update = (newVal: string, newCursor?: number) => {
    onChange(newVal);
    setCursor(newCursor ?? newVal.length);
  };

  useInput((input, key) => {
    if (disabled) return;

    // Esc — clear input (dismisses suggestions + clears text)
    if (key.escape) {
      update("");
      return;
    }

    // Up/Down when suggestions are showing → navigate suggestions
    if (suggestions.length > 0) {
      if (key.upArrow) { onSuggestionNav("up"); return; }
      if (key.downArrow) { onSuggestionNav("down"); return; }
    } else {
      if (key.upArrow) { onHistoryNav("up"); return; }
      if (key.downArrow) { onHistoryNav("down"); return; }
    }

    // Left arrow — move cursor left
    if (key.leftArrow) {
      setCursor(c => Math.max(0, c - 1));
      return;
    }
    // Right arrow — move cursor right
    if (key.rightArrow) {
      setCursor(c => Math.min(value.length, c + 1));
      return;
    }
    // Home / Ctrl+A — jump to start
    if (key.meta || (key.ctrl && input === "a")) {
      setCursor(0);
      return;
    }
    // End / Ctrl+E — jump to end
    if (key.ctrl && input === "e") {
      setCursor(value.length);
      return;
    }

    // Ctrl+W — delete previous word
    if (key.ctrl && input === "w") {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      const wordMatch = before.match(/(\s*\S+\s*)$/);
      if (wordMatch) {
        const newPos = cursor - wordMatch[1].length;
        update(before.slice(0, newPos) + after, newPos);
      }
      return;
    }
    // Ctrl+U — delete from cursor to start
    if (key.ctrl && input === "u") {
      update(value.slice(cursor), 0);
      return;
    }
    // Ctrl+K — delete from cursor to end
    if (key.ctrl && input === "k") {
      update(value.slice(0, cursor), cursor);
      return;
    }

    // Enter — submit
    if (key.return) {
      if (suggestions.length > 0 && suggestions[suggestionIndex]) {
        onSubmit(suggestions[suggestionIndex].value);
      } else {
        onSubmit(value);
      }
      return;
    }

    // Tab — accept suggestion into input
    if (key.tab && suggestions.length > 0) {
      const s = suggestions[suggestionIndex];
      if (s) onAcceptSuggestion(s.value);
      return;
    }

    // Backspace — delete char before cursor
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        update(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
      }
      return;
    }

    // Ctrl-C — clear input or exit
    if (key.ctrl && input === "c") {
      if (value.length > 0) update("");
      else onSubmit("__exit__");
      return;
    }

    // Regular character — insert at cursor position
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      update(value.slice(0, cursor) + input + value.slice(cursor), cursor + 1);
    }
  });

  const showPlaceholder = value.length === 0 && !disabled;

  // Render input with visible cursor position
  const beforeCursor = value.slice(0, cursor);
  const atCursor = value.slice(cursor, cursor + 1);
  const afterCursor = value.slice(cursor + 1);

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
          <Text>
            <Text color="white">{beforeCursor}</Text>
            {!disabled && <Text color="magenta" inverse>{atCursor || " "}</Text>}
            {atCursor && <Text color="white">{afterCursor}</Text>}
          </Text>
        )}
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
