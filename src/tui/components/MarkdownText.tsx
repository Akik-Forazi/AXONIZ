/**
 * MarkdownText — render markdown text in Ink with proper formatting.
 *
 * Parses inline markdown:
 *   - **bold**      → <Text bold>
 *   - *italic*      → <Text italic>
 *   - `inline code` → <Text color="cyan">
 *   - - bullet      → ▸ prefix
 *   - 1. numbered   → numbered prefix
 *   - ``` code ```  → boxed code block
 *
 * Mirrors what the CLI's printResponse() does, but in React/Ink.
 */
import React from "react";
import { Box, Text } from "ink";

interface Props {
  content: string;
  pending?: boolean;
}

interface CodeBlock {
  lang: string;
  lines: string[];
}

function parseContent(text: string): Array<React.ReactNode> {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fence
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
      } else {
        inCode = false;
        nodes.push(<CodeBlockView key={`code-${i}`} lang={codeLang} lines={codeBuf} />);
        codeBuf = [];
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      nodes.push(<Box key={`empty-${i}`} height={0} />);
      continue;
    }

    // Bullet
    if (/^\s*[-*]\s+/.test(line)) {
      const body = line.replace(/^\s*[-*]\s+/, "").trim();
      nodes.push(
        <Box key={`bullet-${i}`} paddingLeft={1}>
          <Text color="magenta">▸ </Text>
          <Text color="white">{renderInline(body)}</Text>
        </Box>,
      );
      continue;
    }

    // Numbered
    const num = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (num) {
      nodes.push(
        <Box key={`num-${i}`} paddingLeft={1}>
          <Text color="magenta">{num[2]}. </Text>
          <Text color="white">{renderInline(num[3])}</Text>
        </Box>,
      );
      continue;
    }

    // Heading
    if (line.startsWith("### ")) {
      nodes.push(
        <Box key={`h3-${i}`} paddingLeft={1}>
          <Text bold color="magenta">{renderInline(line.slice(4))}</Text>
        </Box>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <Box key={`h2-${i}`} paddingLeft={1}>
          <Text bold color="magenta">{renderInline(line.slice(3))}</Text>
        </Box>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(
        <Box key={`h1-${i}`} paddingLeft={1}>
          <Text bold color="magenta">{renderInline(line.slice(2))}</Text>
        </Box>,
      );
      continue;
    }

    // Regular text
    nodes.push(
      <Box key={`text-${i}`} paddingLeft={2}>
        <Text color="gray">{renderInline(line)}</Text>
      </Box>,
    );
  }

  // Flush unterminated code block
  if (inCode && codeBuf.length > 0) {
    nodes.push(<CodeBlockView key="code-flush" lang={codeLang} lines={codeBuf} />);
  }

  return nodes;
}

/** Parse inline markdown: **bold**, *italic*, `code` */
function renderInline(text: string): React.ReactNode {
  // Split on `code` spans first (they take priority)
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={i} color="cyan" bold>
          {part.slice(1, -1)}
        </Text>
      );
    }
    // Split on **bold** and *italic*
    return renderBoldItalic(part, i);
  });
}

function renderBoldItalic(text: string, keyPrefix: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={`${keyPrefix}-${i}`} bold color="white">
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <Text key={`${keyPrefix}-${i}`} italic color="gray">
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={`${keyPrefix}-${i}`} color="gray">{part}</Text>;
  });
}

function CodeBlockView({ lang, lines }: { lang: string; lines: string[] }) {
  const label = (lang || "code").toUpperCase();
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      marginX={2}
      marginY={0}
    >
      <Text color="cyan" dimColor> {label} </Text>
      {lines.map((line, i) => (
        <Text key={i} color="cyan">  {line}</Text>
      ))}
    </Box>
  );
}

export function MarkdownText({ content, pending }: Props) {
  if (!content) {
    return pending ? (
      <Box paddingLeft={2}>
        <Text color="gray" dimColor>...{pending ? "▋" : ""}</Text>
      </Box>
    ) : null;
  }

  // Check if this is an error message
  const isError = content.startsWith("[ERROR]") || content.includes("[ERROR]");

  if (isError) {
    return (
      <Box paddingLeft={2}>
        <Text color="red">✗ {content}</Text>
        {pending && <Text color="magenta">▋</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {parseContent(content)}
      {pending && <Text color="magenta">▋</Text>}
    </Box>
  );
}
