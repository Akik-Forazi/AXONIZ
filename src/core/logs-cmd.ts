/**
 * AXONIZ diagnostic log CLI commands.
 *
 * Subcommands:
 *   axoniz logs path                  Print the resolved log directory
 *   axoniz logs list                  List all .axolog sessions
 *   axoniz logs show [session]        Print events from a session
 *   axoniz logs verify [session]      Check for malformed records
 *   axoniz logs export [session] [f]  Export to a file
 *   axoniz logs cleanup [--keep N]    Remove old sessions (defaults to keep 10)
 *
 * Filters for `show`:
 *   --severity <level>     Filter by severity (debug/info/warn/error/fatal)
 *   --event-type <type>    Filter by event_type
 *   --component <name>      Filter by component
 *   --since <iso>           Only events after this ISO timestamp
 *   --until <iso>           Only events before this ISO timestamp
 *   --tail <N>              Only the last N events
 *
 * Exit codes:
 *   0 — success
 *   1 — usage error / file not found
 *   2 — partial success (some records malformed)
 *
 * Never prints secrets to stdout. Malformed records are reported but
 * not parsed for content.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

import { C } from "./runner.js";
import { getDiagLogDir, listAxologs } from "./diagnostics.js";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function print(s: string): void {
  process.stdout.write(s + "\n");
}

function err(s: string): void {
  process.stderr.write(s + "\n");
}

interface LogEvent {
  sequence?: number;
  timestamp?: string;
  timestamp_utc?: string;
  timezone_offset?: string;
  session_id?: string;
  event_id?: string;
  process_id?: number;
  application?: string;
  application_version?: string;
  component?: string;
  event_type?: string;
  severity?: string;
  route?: string;
  action?: string;
  duration_ms?: number;
  correlation_id?: string;
  details?: Record<string, unknown>;
  redaction_applied?: boolean;
  schema_version?: number;
  // Raw unparsed line, if parsing failed.
  __raw?: string;
  __parse_error?: string;
}

/** Parse one .axolog file into events. Reports malformed lines. */
async function parseFile(filePath: string): Promise<{
  events: LogEvent[];
  totalLines: number;
  parsed: number;
  broken: number;
  brokenSamples: string[];
}> {
  const events: LogEvent[] = [];
  let totalLines = 0;
  let parsed = 0;
  let broken = 0;
  const brokenSamples: string[] = [];

  let stream: fs.ReadStream;
  try {
    stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  } catch (e) {
    err(`${C.RED}Cannot open ${filePath}: ${String(e)}${C.RESET}`);
    return { events, totalLines: 0, parsed: 0, broken: 0, brokenSamples: [] };
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    totalLines++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const evt = JSON.parse(trimmed) as LogEvent;
      events.push(evt);
      parsed++;
    } catch (e) {
      broken++;
      if (brokenSamples.length < 3) {
        brokenSamples.push(trimmed.slice(0, 200));
      }
      events.push({
        __raw: trimmed.slice(0, 500),
        __parse_error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { events, totalLines, parsed, broken, brokenSamples };
}

interface Filters {
  severity?: string;
  event_type?: string;
  component?: string;
  since?: string;
  until?: string;
  tail?: number;
}

function parseFilters(args: string[]): Filters {
  const f: Filters = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // Support --key=value syntax.
    let key = a;
    let inlineVal: string | undefined;
    if (a.startsWith("--") && a.includes("=")) {
      const idx = a.indexOf("=");
      key = a.slice(0, idx);
      inlineVal = a.slice(idx + 1);
    }
    const nextVal = (): string | undefined => {
      if (inlineVal !== undefined) return inlineVal;
      if (i + 1 < args.length) {
        i++;
        return args[i];
      }
      return undefined;
    };
    if (key === "--severity") f.severity = nextVal()?.toLowerCase();
    else if (key === "--event-type") f.event_type = nextVal();
    else if (key === "--component") f.component = nextVal();
    else if (key === "--since") f.since = nextVal();
    else if (key === "--until") f.until = nextVal();
    else if (key === "--tail") f.tail = parseInt(nextVal() ?? "0", 10) || undefined;
  }
  return f;
}

function applyFilters(events: LogEvent[], f: Filters): LogEvent[] {
  let out = events.filter(e => !e.__raw); // drop broken for filtering
  // Extract locals before closures — TypeScript's control-flow narrowing
  // does not propagate captured variables into closures, so we capture
  // them as consts here to keep the strict-mode compiler happy.
  if (f.severity) {
    const sev = f.severity;
    out = out.filter(e => (e.severity ?? "").toLowerCase() === sev);
  }
  if (f.event_type) {
    const et = f.event_type;
    out = out.filter(e => e.event_type === et);
  }
  if (f.component) {
    const comp = f.component;
    out = out.filter(e => (e.component ?? "").includes(comp));
  }
  if (f.since) {
    const t = Date.parse(f.since);
    if (!Number.isNaN(t)) out = out.filter(e => e.timestamp_utc && Date.parse(e.timestamp_utc) >= t);
  }
  if (f.until) {
    const t = Date.parse(f.until);
    if (!Number.isNaN(t)) out = out.filter(e => e.timestamp_utc && Date.parse(e.timestamp_utc) <= t);
  }
  if (f.tail) out = out.slice(-f.tail);
  return out;
}

/** Format an event for human-readable display. NEVER prints `details` raw. */
function formatEvent(e: LogEvent): string {
  if (e.__raw) {
    return `  ${C.RED}[BROKEN]${C.RESET} ${e.__raw}`;
  }
  const ts = e.timestamp_utc ?? e.timestamp ?? "?";
  const sev = (e.severity ?? "info").toUpperCase().padEnd(5);
  const sevColor =
    sev.startsWith("ERROR") ? C.RED :
    sev.startsWith("WARN") ? C.YELLOW :
    sev.startsWith("FATAL") ? C.PURPLE :
    C.GRAY;
  const comp = (e.component ?? "").padEnd(20).slice(0, 20);
  const et = (e.event_type ?? "").padEnd(20).slice(0, 20);
  const route = e.route ? ` ${C.GRAY}${e.route}${C.RESET}` : "";
  const action = e.action ? ` ${C.CYAN}${e.action}${C.RESET}` : "";
  const dur = e.duration_ms != null ? ` ${C.GRAY}${e.duration_ms}ms${C.RESET}` : "";
  // Sanitize details: only show KEYS, not VALUES — values may still
  // contain sensitive content even after redaction (defense in depth).
  const detailKeys = e.details ? Object.keys(e.details).slice(0, 8).join(",") : "";
  const detailStr = detailKeys ? ` ${C.GRAY}{${detailKeys}}${C.RESET}` : "";
  return `  ${C.GRAY}${ts}${C.RESET} ${sevColor}${sev}${C.RESET} ${comp} ${et}${route}${action}${dur}${detailStr}`;
}

/* ── Commands ────────────────────────────────────────────────────────────── */

function cmdPath(): number {
  print(getDiagLogDir());
  return 0;
}

function cmdList(): number {
  const files = listAxologs();
  if (files.length === 0) {
    print(`${C.GRAY}(no .axolog sessions found)${C.RESET}`);
    return 0;
  }
  print(`${C.BOLD}Found ${files.length} session(s)${C.RESET}\n`);
  for (const f of files) {
    const sizeStr = f.size < 1024
      ? `${f.size}B`
      : f.size < 1024 * 1024
        ? `${(f.size / 1024).toFixed(1)}KB`
        : `${(f.size / 1024 / 1024).toFixed(1)}MB`;
    const mtime = f.mtime.toISOString().replace("T", " ").slice(0, 19);
    print(`  ${C.CYAN}${f.name}${C.RESET}  ${C.GRAY}${sizeStr.padEnd(10)} ${mtime}${C.RESET}`);
  }
  return 0;
}

/** Return only the args that are NOT filter flags or their values. */
function extractSessionName(args: string[]): string | undefined {
  // Recognize filter flags that take a value.
  const valueFlags = new Set([
    "--severity", "--event-type", "--component", "--since", "--until", "--tail",
    "--keep",
  ]);
  const boolFlags = new Set(["--yes", "-y", "--include-raw"]);
  // Skip the subcommand name (show/verify/export/cleanup) — it's args[0]
  // when called via runLogsCmd. Actually, the caller passes args already
  // sliced past the subcommand, so we scan all args.
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--") && a.includes("=")) continue; // --key=value
    if (valueFlags.has(a)) {
      i++; // skip value
      continue;
    }
    if (boolFlags.has(a)) continue;
    if (a.startsWith("--")) continue; // unknown flag — skip
    if (a.endsWith(".json") || a.endsWith(".jsonl")) continue; // output file
    return a;
  }
  return undefined;
}

async function cmdShow(args: string[]): Promise<number> {
  const fileArg = extractSessionName(args);
  const files = listAxologs();
  if (files.length === 0) {
    err(`${C.GRAY}(no .axolog sessions found)${C.RESET}`);
    return 1;
  }
  const target = fileArg
    ? files.find(f => f.name === fileArg || f.name.startsWith(fileArg))
    : files[0];
  if (!target) {
    err(`${C.RED}No session matching '${fileArg}'${C.RESET}`);
    return 1;
  }
  const { events, totalLines, parsed, broken } = await parseFile(target.path);
  const filters = parseFilters(args);
  const filtered = applyFilters(events, filters);

  print(`${C.BOLD}File:${C.RESET} ${target.path}`);
  print(`${C.BOLD}Lines:${C.RESET} ${totalLines} (parsed ${parsed}, broken ${broken})`);
  print(`${C.BOLD}After filters:${C.RESET} ${filtered.length}\n`);
  for (const e of filtered) {
    print(formatEvent(e));
  }
  return broken > 0 ? 2 : 0;
}

async function cmdVerify(args: string[]): Promise<number> {
  const fileArg = args.find(a => !a.startsWith("--"));
  const files = listAxologs();
  if (files.length === 0) {
    err(`${C.GRAY}(no .axolog sessions found)${C.RESET}`);
    return 1;
  }
  const targets = fileArg
    ? files.filter(f => f.name === fileArg || f.name.startsWith(fileArg))
    : files;
  if (targets.length === 0) {
    err(`${C.RED}No session matching '${fileArg}'${C.RESET}`);
    return 1;
  }
  let overallBroken = 0;
  for (const t of targets) {
    const { totalLines, parsed, broken, brokenSamples } = await parseFile(t.path);
    const status = broken === 0 ? `${C.GREEN}OK${C.RESET}` : `${C.RED}${broken} BROKEN${C.RESET}`;
    print(`${C.CYAN}${t.name}${C.RESET}  lines=${totalLines} parsed=${parsed} broken=${broken}  ${status}`);
    if (brokenSamples.length > 0) {
      print(`  ${C.GRAY}samples:${C.RESET}`);
      for (const s of brokenSamples) {
        print(`    ${C.RED}${s.slice(0, 100)}${C.RESET}`);
      }
    }
    overallBroken += broken;
  }
  return overallBroken > 0 ? 2 : 0;
}

async function cmdExport(args: string[]): Promise<number> {
  const fileArg = args.find(a => !a.startsWith("--") && !a.endsWith(".json") && !a.endsWith(".jsonl"));
  const outArg = args.find(a => a.endsWith(".json") || a.endsWith(".jsonl"));
  const files = listAxologs();
  if (files.length === 0) {
    err(`${C.GRAY}(no .axolog sessions found)${C.RESET}`);
    return 1;
  }
  const target = fileArg
    ? files.find(f => f.name === fileArg || f.name.startsWith(fileArg))
    : files[0];
  if (!target) {
    err(`${C.RED}No session matching '${fileArg}'${C.RESET}`);
    return 1;
  }
  const outPath = outArg ?? path.join(process.cwd(), `${target.name}.export.jsonl`);
  const { events, totalLines, parsed, broken } = await parseFile(target.path);
  const filters = parseFilters(args);
  const filtered = applyFilters(events, filters);

  // Write all events (including broken ones as {"_broken": "..."}) as NDJSON.
  // NEVER include the raw unparsed text in the export unless --include-raw is set.
  const includeRaw = args.includes("--include-raw");
  const out = fs.createWriteStream(outPath, { encoding: "utf-8" });
  for (const e of filtered) {
    if (e.__raw && !includeRaw) {
      out.write(JSON.stringify({ _broken: true, _sequence_unknown: true }) + "\n");
    } else {
      out.write(JSON.stringify(e) + "\n");
    }
  }
  out.end();
  await new Promise<void>(resolve => out.on("close", () => resolve()));
  print(`${C.GREEN}Exported ${filtered.length} events${C.RESET} from ${target.name} to ${outPath}`);
  print(`  parsed=${parsed} broken=${broken} total=${totalLines}`);
  return broken > 0 ? 2 : 0;
}

async function cmdCleanup(args: string[]): Promise<number> {
  // Parse --keep N (default 10)
  let keep = 10;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keep" && i + 1 < args.length) {
      keep = parseInt(args[++i], 10) || 10;
    }
  }
  const yes = args.includes("--yes") || args.includes("-y");
  const files = listAxologs();
  if (files.length <= keep) {
    print(`${C.GRAY}Nothing to clean up (${files.length} sessions, keeping ${keep}).${C.RESET}`);
    return 0;
  }
  const toDelete = files.slice(keep);
  print(`${C.BOLD}Will delete ${toDelete.length} session(s):${C.RESET}`);
  for (const f of toDelete) {
    print(`  ${C.GRAY}${f.name}${C.RESET}`);
  }
  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${C.YELLOW}Proceed? [y/N] ${C.RESET}`, resolve);
    });
    rl.close();
    if (!/^[yY]/.test(answer.trim())) {
      print(`${C.GRAY}Aborted.${C.RESET}`);
      return 1;
    }
  }
  let deleted = 0;
  for (const f of toDelete) {
    try {
      fs.unlinkSync(f.path);
      // Also delete rotations: .axolog.1, .axolog.2, ...
      for (let i = 1; i <= 10; i++) {
        const rot = `${f.path}.${i}`;
        try { fs.unlinkSync(rot); } catch { /* may not exist */ }
      }
      deleted++;
    } catch (e) {
      err(`${C.RED}Failed to delete ${f.name}: ${String(e)}${C.RESET}`);
    }
  }
  print(`${C.GREEN}Deleted ${deleted} session(s).${C.RESET}`);
  return 0;
}

function cmdHelp(): number {
  print(`
  ${C.BOLD}axoniz logs${C.RESET} — diagnostic log management

  ${C.BOLD}USAGE${C.RESET}
    axoniz logs <subcommand> [args]

  ${C.BOLD}SUBCOMMANDS${C.RESET}
    ${C.CYAN}path${C.RESET}                   Print the resolved log directory
    ${C.CYAN}list${C.RESET}                   List all .axolog sessions (newest first)
    ${C.CYAN}show${C.RESET} [session] [filters]
                            Show events from a session
    ${C.CYAN}verify${C.RESET} [session]        Check for malformed/truncated records
    ${C.CYAN}export${C.RESET} [session] [out] [--include-raw]
                            Export a session to .jsonl
    ${C.CYAN}cleanup${C.RESET} [--keep N] [--yes]
                            Delete old sessions beyond the N newest

  ${C.BOLD}FILTERS (for 'show' and 'export')${C.RESET}
    --severity <level>     debug | info | warn | error | fatal
    --event-type <type>    e.g. click, navigation, http_request
    --component <name>     e.g. frontend.fetch, ui
    --since <iso>          Only events at/after this ISO timestamp
    --until <iso>          Only events at/before this ISO timestamp
    --tail <N>             Only the last N events

  ${C.BOLD}EXAMPLES${C.RESET}
    axoniz logs list
    axoniz logs show
    axoniz logs show --severity error --tail 20
    axoniz logs show --event-type http_request --since 2026-10-14T20:00:00Z
    axoniz logs verify
    axoniz logs export alice /tmp/alice.jsonl
    axoniz logs cleanup --keep 5 --yes

  ${C.BOLD}EXIT CODES${C.RESET}
    0  success
    1  usage error / file not found
    2  partial success (some records malformed)
  `);
  return 0;
}

/* ── Entry ───────────────────────────────────────────────────────────────── */

export async function runLogsCmd(args: string[]): Promise<number> {
  const sub = args[0] ?? "help";
  const rest = args.slice(1);
  switch (sub) {
    case "path": return cmdPath();
    case "list": case "ls": return cmdList();
    case "show": case "cat": return await cmdShow(rest);
    case "verify": case "check": return await cmdVerify(rest);
    case "export": return await cmdExport(rest);
    case "cleanup": case "clean": return await cmdCleanup(rest);
    case "help": case "--help": case "-h": return cmdHelp();
    default:
      err(`${C.RED}Unknown subcommand: ${sub}${C.RESET}`);
      cmdHelp();
      return 1;
  }
}
