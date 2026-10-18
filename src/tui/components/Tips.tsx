/**
 * Tips — startup hints, gemini-cli Tips.tsx pattern.
 * Shows 4 numbered tips for getting started.
 */
import React from "react";
import { Box, Text } from "ink";

const theme = {
  primary: "white",
  secondary: "gray",
  accent: "magenta",
  muted: "gray",
};

export function Tips() {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.primary}>Tips for getting started:</Text>
      <Text color={theme.primary}>
        {" "}
        1. <Text color={theme.secondary}>/help</Text> for commands + shortcuts
      </Text>
      <Text color={theme.primary}>
        {" "}
        2. <Text bold>/models</Text> to list models, <Text bold>/switch</Text> to switch providers
      </Text>
      <Text color={theme.primary}>
        {" "}
        3. <Text bold>/tools</Text> to see what the agent can do, <Text bold>/web</Text> for dashboard
      </Text>
      <Text color={theme.primary}>
        {" "}
        4. Type <Text color={theme.accent}>@file.txt</Text> to attach, <Text color={theme.accent}>!cmd</Text> for shell
      </Text>
    </Box>
  );
}
