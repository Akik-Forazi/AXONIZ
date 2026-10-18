/**
 * SuggestionsDisplay — gemini-cli SuggestionsDisplay pattern.
 *
 * Renders a dropdown list of matching slash commands when the input
 * starts with `/`. Highlights the currently-selected item with ▸.
 *
 * Same as gemini-cli's SuggestionsDisplay — caps at MAX_WIDTH cols,
 * shows top 8 matches.
 */
import React from "react";
import { Box, Text } from "ink";

export interface SlashCommand {
  id: string;
  label: string;
  value: string;
  description: string;
}

interface Props {
  suggestions: SlashCommand[];
  selectedIndex: number;
  position?: "above" | "below";
}

export const MAX_WIDTH = 60;

export function SuggestionsDisplay({ suggestions, selectedIndex, position = "below" }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <Box
      flexDirection="column"
      marginTop={position === "below" ? 1 : 0}
      marginBottom={position === "above" ? 1 : 0}
      paddingLeft={1}
    >
      {suggestions.slice(0, 8).map((s, i) => {
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? "▸ " : "  ";
        return (
          <Box key={s.id}>
            <Text color={isSelected ? "magenta" : "gray"}>
              {prefix}
              <Text bold={isSelected} color={isSelected ? "magenta" : "gray"}>
                {s.value.padEnd(14)}
              </Text>
              <Text color="gray"> {s.description.slice(0, 40)}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
