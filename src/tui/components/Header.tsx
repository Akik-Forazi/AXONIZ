/**
 * Header — gemini-cli AppHeader pattern.
 *
 * Layout (mirrors gemini-cli's AppHeader):
 *   ┌─ row ─────────────────────────────────┐
 *   │ ◈  AXONIZ CLI  v0.1.8                 │   ← logo icon + brand text
 *   │                                        │
 *   │ Tips for getting started:              │   ← Tips component
 *   │  1. /help for commands                  │
 *   │  2. /models to list models              │
 *   │  3. /tools to see what the agent can do │
 *   │  4. Type @file.txt to attach            │
 *   └────────────────────────────────────────┘
 */
import React from "react";
import { Box, Text } from "ink";
import { Tips } from "./Tips.js";

interface HeaderProps {
  version: string;
  showTips?: boolean;
  showDetails?: boolean;
}

// AXONIZ logo icon — small block character on the left
// (mirrors gemini-cli's DEFAULT_ICON ▝▜▄ pattern)
const LOGO_ICON = "◈";

export function Header({ version, showTips = true, showDetails = true }: HeaderProps) {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} paddingLeft={1}>
      <Box flexDirection="row">
        <Box flexShrink={0}>
          <Text color="magenta" bold>{LOGO_ICON}</Text>
        </Box>
        <Box marginLeft={2} flexDirection="column">
          <Box>
            <Text bold color="white">AXONIZ CLI</Text>
            <Text color="gray"> v{version}</Text>
          </Box>
          {showDetails && (
            <>
              <Box height={1} />
              <Text color="gray">local-first AI agent · shadow-monarch edition</Text>
            </>
          )}
        </Box>
      </Box>
      {showTips && <Tips />}
    </Box>
  );
}
