/**
 * Footer — gemini-cli Footer.tsx pattern.
 *
 * Multi-column row at the bottom with width-fitting. Columns:
 *   workspace · git-branch · sandbox · model-name · tokens · elapsed
 *
 * Drops low-priority columns when terminal is narrow + appends `…` ellipsis
 * (same algorithm as gemini-cli's Footer.tsx).
 */
import React from "react";
import { Box, Text } from "ink";

export interface FooterData {
  cwd: string;
  gitBranch: string | null;
  model: string;
  provider: string;
  tokens: number;
  elapsedSec: number;
  contextUsed?: number;  // 0-100
  isTrusted?: boolean;
}

function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n).toLowerCase();
}

function shortPath(p: string, max: number): string {
  // tildeify + shorten — same as gemini-cli's shortenPath
  const home = process.env.HOME || process.env.USERPROFILE || "";
  let s = p;
  if (home && p.startsWith(home)) s = "~" + p.slice(home.length);
  if (s.length <= max) return s;
  const parts = s.split(/[\\/]/);
  if (parts.length <= 2) return s;
  return parts[0] + "/.../" + parts[parts.length - 1];
}

export function Footer({ data, terminalWidth }: { data: FooterData; terminalWidth: number }) {
  const SEP = " · ";
  const cols: Array<{ id: string; text: string; minWidth: number; highPriority?: boolean }> = [];

  // 1. workspace (high priority — always shown)
  cols.push({
    id: "workspace",
    text: shortPath(data.cwd, 20),
    minWidth: 8,
    highPriority: true,
  });

  // 2. git-branch (when present)
  if (data.gitBranch) {
    cols.push({ id: "git", text: data.gitBranch, minWidth: data.gitBranch.length });
  }

  // 3. sandbox / trust indicator
  cols.push({
    id: "trust",
    text: data.isTrusted === false ? "untrusted" : "trusted",
    minWidth: 8,
  });

  // 4. model (high priority)
  const modelStr = `${data.provider}/${data.model}`.slice(0, 40);
  cols.push({
    id: "model",
    text: modelStr,
    minWidth: modelStr.length,
    highPriority: true,
  });

  // 5. tokens (compact format)
  if (data.tokens > 0) {
    cols.push({
      id: "tokens",
      text: `${compactNumber(data.tokens)} tokens`,
      minWidth: 10,
    });
  }

  // 6. elapsed
  if (data.elapsedSec > 0) {
    cols.push({
      id: "elapsed",
      text: `${data.elapsedSec}s`,
      minWidth: 3,
    });
  }

  // Width-fitting algorithm (gemini-cli Footer.tsx technique)
  const maxWidth = terminalWidth - 4;
  const columnsToShow: typeof cols = [];
  let usedWidth = 0;
  let droppedAny = false;
  for (const col of cols) {
    const gap = columnsToShow.length > 0 ? SEP.length : 0;
    const budgetWidth = col.id === "workspace" ? Math.min(col.minWidth, 20) : col.minWidth;
    if (col.highPriority || usedWidth + gap + budgetWidth <= maxWidth) {
      columnsToShow.push(col);
      usedWidth += gap + budgetWidth;
    } else {
      droppedAny = true;
    }
  }

  const parts = columnsToShow.map((c, i) => {
    const sep = i > 0 ? <Text color="gray"> · </Text> : null;
    let content: React.ReactNode;
    if (c.id === "workspace") content = <Text color="cyan">{c.text}</Text>;
    else if (c.id === "git") content = <Text color="yellow">{c.text}</Text>;
    else if (c.id === "trust") content = <Text color={c.text === "trusted" ? "green" : "red"}>{c.text}</Text>;
    else if (c.id === "model") content = <Text color="magenta">{c.text}</Text>;
    else if (c.id === "tokens") content = <Text color="white">{c.text}</Text>;
    else content = <Text color="gray">{c.text}</Text>;
    return (
      <React.Fragment key={c.id}>
        {sep}
        {content}
      </React.Fragment>
    );
  });

  if (droppedAny) {
    parts.push(<Text key="ellipsis" color="gray">…</Text>);
  }

  return (
    <Box paddingLeft={1}>
      {parts}
    </Box>
  );
}
