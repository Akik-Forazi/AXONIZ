/**
 * MainContent — gemini-cli MainContent.tsx pattern.
 *
 * The scrolling message log. Renders:
 *   - Header (banner + version + tips) at the top, ONCE
 *   - All past messages (user + assistant + tool) in order
 *   - Spinner when busy
 *
 * Each message type renders differently:
 *   - user:        `> hi`              (magenta prefix)
 *   - assistant:   markdown-rendered   (MarkdownText component)
 *   - tool:        `  ✓ result preview` (indented, green check)
 */
import React from "react";
import { Box, Text } from "ink";
import { Header } from "./Header.js";
import { Spinner } from "./Spinner.js";
import { MarkdownText } from "./MarkdownText.js";

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  pending?: boolean;
  toolName?: string;
}

interface Props {
  messages: Message[];
  busy: boolean;
  version: string;
}

export function MainContent({ messages, busy, version }: Props) {
  return (
    <Box flexDirection="column">
      <Header version={version} />
      {messages.map(m => (
        <MessageRow key={m.id} message={m} />
      ))}
      {busy && <Spinner text="thinking" color="magenta" />}
    </Box>
  );
}

function MessageRow({ message: m }: { message: Message }) {
  if (m.role === "user") {
    return (
      <Box>
        <Text color="magenta" bold>{"> "}</Text>
        <Text color="white">{m.content}</Text>
      </Box>
    );
  }
  if (m.role === "tool") {
    return (
      <Box paddingLeft={2}>
        <Text color="green">✓ </Text>
        <Text color="gray">{m.content.slice(0, 120)}</Text>
      </Box>
    );
  }
  // assistant — render with markdown
  return <MarkdownText content={m.content} pending={m.pending} />;
}
