/**
 * Spinner — gemini-cli CliSpinner pattern.
 *
 * Animated braille-dot spinner with optional text label.
 * Uses setInterval at 80ms (same as gemini-cli) — no flicker.
 */
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ text = "thinking", color = "magenta" }: { text?: string; color?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <Box>
      <Text color={color}>{FRAMES[frame]}</Text>
      <Text color="gray"> {text}</Text>
    </Box>
  );
}
