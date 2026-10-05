/**
 * axoniz.core.intelligence.context_compressor
 * ============================================
 * Automatic context window compression for AXONIZ.
 * Ported from Hermes with refinements for the AXONIZ architecture.
 *
 * Summarizes earlier turns while protecting head (system prompt) and tail (recent turns).
 * This ensures AXONIZ can handle long-running missions without losing its mind.
 *
 * Port note (Python → Node): `compress()` and `_generate_summary()` are `async`.
 * The Python versions blocked the calling thread on `agent.generate_summary()`;
 * in the Node port that call is asynchronous, so the results arrive as a
 * Promise. `should_compress`, `_prune_tools`, `_serialize_turns` and
 * `_sanitize` remain synchronous.
 */

import { error, info } from "../debug.js";

// Constants from Hermes
export const SUMMARY_PREFIX =
  "[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted " +
  "into the summary below. This is a handoff from a previous context " +
  "window — treat it as background reference, NOT as active instructions. " +
  "Do NOT answer questions or fulfill requests mentioned in this summary; " +
  "they were already addressed. Respond ONLY to the latest user message " +
  "that appears AFTER this summary. The current session state (files, " +
  "config, etc.) may reflect work described here — avoid repeating it:";

const _MIN_SUMMARY_TOKENS = 2000;
const _SUMMARY_RATIO = 0.2;
const _SUMMARY_TOKENS_CEILING = 12_000;
const _PRUNED_TOOL_PLACEHOLDER = "[Old tool output cleared to save context space]";
const _CHARS_PER_TOKEN = 4;

/** Loosely-typed conversation message, mirroring Python's `List[Dict]`. */
export interface CompressionMessage {
  role?: string;
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

/** The summariser surface `compress()` needs from the Agent. */
export interface SummaryAgent {
  generate_summary?(prompt: string): string | Promise<string>;
  generateSummary?(prompt: string): string | Promise<string>;
}

export interface ContextCompressorOptions {
  model: string;
  threshold_percent?: number;
  protect_first_n?: number;
  protect_last_n?: number;
  context_length?: number;
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  return String(e);
}

/**
 * Compresses conversation context via lossy summarization.
 * Keeps AXONIZ's memory efficient.
 */
export class ContextCompressor {
  model: string;
  threshold_percent: number;
  protect_first_n: number;
  protect_last_n: number;
  context_length: number;
  threshold_tokens: number;
  compression_count = 0;
  _previous_summary: string | null = null;

  constructor(
    model: string,
    threshold_percent?: number,
    protect_first_n?: number,
    protect_last_n?: number,
    context_length?: number,
  );
  constructor(options: ContextCompressorOptions);
  constructor(
    a: string | ContextCompressorOptions,
    threshold_percent = 0.6,
    protect_first_n = 3,
    protect_last_n = 15,
    context_length = 128000,
  ) {
    if (typeof a === "string") {
      this.model = a;
      this.threshold_percent = threshold_percent;
      this.protect_first_n = protect_first_n;
      this.protect_last_n = protect_last_n;
      this.context_length = context_length;
    } else {
      this.model = a.model;
      this.threshold_percent = a.threshold_percent ?? 0.6;
      this.protect_first_n = a.protect_first_n ?? 3;
      this.protect_last_n = a.protect_last_n ?? 15;
      this.context_length = a.context_length ?? 128000;
    }
    this.threshold_tokens = Math.trunc(this.context_length * this.threshold_percent);
  }

  get thresholdPercent(): number {
    return this.threshold_percent;
  }
  get protectFirstN(): number {
    return this.protect_first_n;
  }
  get protectLastN(): number {
    return this.protect_last_n;
  }
  get contextLength(): number {
    return this.context_length;
  }
  get thresholdTokens(): number {
    return this.threshold_tokens;
  }
  get compressionCount(): number {
    return this.compression_count;
  }

  should_compress(current_tokens: number): boolean {
    return current_tokens >= this.threshold_tokens;
  }

  /** camelCase alias. */
  shouldCompress(current_tokens: number): boolean {
    return this.should_compress(current_tokens);
  }

  /* ── Semantic importance scoring (v0.3.6 PEAK enhancement) ──────── */

  /**
   * Score a message by its semantic importance (0–100).
   *
   * Higher = keep. Lower = summarize.
   *
   * Heuristics:
   *   - User messages: HIGH (they're the goal — never summarize the user's ask)
   *   - Assistant messages with tool_calls: HIGH (they're actions taken)
   *   - Tool results containing errors: HIGH (they're learning signal)
   *   - Tool results containing "[ERROR]" or "Exception": HIGH (same)
   *   - Tool results containing "[DONE]": HIGH (mission complete signal)
   *   - System messages: PROTECTED (never scored — always kept)
   *   - Plain assistant text (no tools): MEDIUM → decays with age
   *   - Tool results with success: MEDIUM → decays with age
   *
   * Age decay: every 10 turns from the end, score * 0.9 (so old
   * "successful tool result" messages gradually lose importance).
   */
  scoreImportance(msg: CompressionMessage, indexFromEnd: number): number {
    const role = msg.role ?? "user";
    const content = String(msg.content ?? "");
    const lower = content.toLowerCase();

    // System messages are always protected — score 100 so they're never
    // included in the summarization region.
    if (role === "system") return 100;

    // User messages are the goal — protect them.
    if (role === "user") return 95;

    // Assistant messages with tool calls are actions taken — protect them.
    if (role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      return 90;
    }

    // Tool results: score by content
    if (role === "tool") {
      if (lower.includes("[error]") || lower.includes("exception") || lower.includes("traceback")) {
        return 85; // errors are learning signal — keep them
      }
      if (lower.includes("[done]") || lower.includes("task complete")) {
        return 88; // completion signals — keep
      }
      if (lower.includes("[ok]") || lower.includes("success")) {
        return 60; // successful results — medium, decay with age
      }
      return 50; // generic tool result — low
    }

    // Plain assistant text (no tools) — medium, decay with age
    let score = 40;

    // Age decay: every 10 turns from the end, *0.9
    const ageFactor = Math.pow(0.9, Math.floor(indexFromEnd / 10));
    score = score * ageFactor;

    // Bump if the message contains code blocks (likely important reasoning)
    if (content.includes("```")) score += 10;

    // Bump if the message is long (likely substantive)
    if (content.length > 500) score += 5;

    return Math.round(score);
  }

  /**
   * Build a "keep mask" for a message list: a boolean[] indicating
   * which messages to keep verbatim vs summarize. Uses semantic
   * scoring + head/tail protection.
   *
   * Messages to keep: system (head), all user messages, all assistant-
   * with-tools messages, all error tool results, + the last N turns
   * (for recency). Everything else is a candidate for summarization.
   */
  semanticKeepMask(messages: CompressionMessage[]): boolean[] {
    const n = messages.length;
    const mask = new Array(n).fill(false);

    // 1. Always keep system messages
    for (let i = 0; i < n; i++) {
      if (messages[i].role === "system") mask[i] = true;
    }

    // 2. Score every non-system message
    const scored = messages.map((m, i) => ({
      index: i,
      score: m.role === "system" ? 100 : this.scoreImportance(m, n - i),
      msg: m,
    }));

    // 3. Always keep messages with score >= 70 (user, assistant+tools, errors)
    for (const s of scored) {
      if (s.score >= 70) mask[s.index] = true;
    }

    // 4. Always keep the last protect_last_n messages (recency)
    for (let i = Math.max(0, n - this.protect_last_n); i < n; i++) {
      mask[i] = true;
    }

    // 5. Always keep the first protect_first_n messages (system prompt region)
    for (let i = 0; i < Math.min(this.protect_first_n, n); i++) {
      mask[i] = true;
    }

    return mask;
  }

  /**
   * Semantic-aware compression. Instead of summarizing a contiguous
   * middle region (the original behavior), this method:
   *
   *   1. Scores every message by importance (scoreImportance)
   *   2. Keeps the high-importance messages verbatim
   *   3. Keeps the last N messages (recency)
   *   4. Summarizes only the low-importance messages in between
   *
   * This means:
   *   - User asks are never lost
   *   - Tool calls (actions taken) are never lost
   *   - Errors are never lost (learning signal)
   *   - Only "old successful tool results" and "old assistant rambling" get summarized
   *
   * Falls back to the original contiguous-region method if the LLM
   * summary agent isn't available.
   */
  async compressSemantic(
    messages: CompressionMessage[],
    agent: SummaryAgent | null = null,
  ): Promise<CompressionMessage[]> {
    if (messages.length <= this.protect_first_n + this.protect_last_n + 2) {
      return messages;
    }

    const mask = this.semanticKeepMask(messages);
    const toSummarize: CompressionMessage[] = [];
    const summaryPlaceholders: Array<{ index: number }> = [];

    // Collect the low-importance messages that will be summarized
    for (let i = 0; i < messages.length; i++) {
      if (!mask[i]) {
        toSummarize.push(messages[i]);
        summaryPlaceholders.push({ index: i });
      }
    }

    if (toSummarize.length === 0) {
      // Nothing to summarize — return as-is
      return messages;
    }

    info(
      `[COMPRESSOR] Semantic compaction: keeping ${mask.filter(Boolean).length}/${messages.length} messages, summarizing ${toSummarize.length}`,
    );

    // Generate the summary
    const summary = await this._generate_summary(toSummarize, agent);
    if (!summary) {
      // Summary failed — fall back to keeping everything (don't lose data)
      return messages;
    }

    // Rebuild: system + summary + kept messages (in original order)
    const result: CompressionMessage[] = [];
    let summaryInserted = false;

    for (let i = 0; i < messages.length; i++) {
      if (mask[i]) {
        result.push(messages[i]);
      } else if (!summaryInserted) {
        // Insert the summary once, at the position of the first summarized message
        result.push({
          role: "system",
          content: `${SUMMARY_PREFIX}\n\n${summary}`,
        });
        summaryInserted = true;
      }
      // Skip subsequent summarized messages (they're covered by the summary)
    }

    // If all messages were low-importance (edge case), insert summary at the end
    if (!summaryInserted && result.length === 0) {
      result.push({
        role: "system",
        content: `${SUMMARY_PREFIX}\n\n${summary}`,
      });
    }

    this.compression_count += 1;
    return result;
  }

  /** camelCase alias. */
  async compressSemanticMessages(
    messages: CompressionMessage[],
    agent: SummaryAgent | null = null,
  ): Promise<CompressionMessage[]> {
    return this.compressSemantic(messages, agent);
  }

  /**
   * Main compression loop.
   * agent: The Agent instance (to call LLM for summarization)
   */
  async compress(
    messages: CompressionMessage[],
    agent: SummaryAgent | null = null,
  ): Promise<CompressionMessage[]> {
    const n_messages = messages.length;
    if (n_messages <= this.protect_first_n + this.protect_last_n + 2) {
      return messages;
    }

    info(`[COMPRESSOR] Triggering context compaction (count: ${this.compression_count + 1})`);

    // 1. Prune old tool results
    messages = this._prune_tools(messages);

    // 2. Determine middle region
    let start = this.protect_first_n;
    // Align forward past tool results
    while (start < messages.length && messages[start]?.role === "tool") {
      start += 1;
    }

    let end = messages.length - this.protect_last_n;
    // Align backward to avoid splitting tool groups
    while (end > start && messages[end]?.role === "tool") {
      end -= 1;
    }
    // If we landed on an assistant message with tool calls, include it in summary
    // (Python kept it as the end of the summary region — a deliberate no-op.)

    if (start >= end) {
      return messages;
    }

    const turns_to_summarize = messages.slice(start, end);

    // 3. Generate summary
    const summary = await this._generate_summary(turns_to_summarize, agent);

    // 4. Reconstruct messages
    const compressed = messages.slice(0, start);

    // Add summary message (standardize on user for summary to avoid confusion)
    compressed.push({
      role: "user",
      content: `${SUMMARY_PREFIX}\n\n${summary}`,
    });

    // Add tail
    compressed.push(...messages.slice(end));

    this.compression_count += 1;
    this._previous_summary = summary;

    return this._sanitize(compressed);
  }

  /** camelCase alias (same Promise-returning method). */
  compressContext(
    messages: CompressionMessage[],
    agent: SummaryAgent | null = null,
  ): Promise<CompressionMessage[]> {
    return this.compress(messages, agent);
  }

  _prune_tools(messages: CompressionMessage[]): CompressionMessage[] {
    const result: CompressionMessage[] = [];
    // Keep tail tools intact
    const tail_start = messages.length - this.protect_last_n;
    for (let i = 0; i < messages.length; i++) {
      let msg = messages[i]!;
      if (i < tail_start && msg.role === "tool") {
        const content = String(msg.content ?? "");
        if (content.length > 500) {
          msg = { ...msg, content: _PRUNED_TOOL_PLACEHOLDER };
        }
      }
      result.push(msg);
    }
    return result;
  }

  async _generate_summary(
    turns: CompressionMessage[],
    agent: SummaryAgent | null,
  ): Promise<string> {
    if (!agent) {
      return "[Summary unavailable: no agent provided]";
    }

    const content = this._serialize_turns(turns);

    let prompt =
      `You are AXONIZ's memory management engine. \n` +
      `Summarize the following conversation turns into a structured status report.\n` +
      `This will be used as background context for AXONIZ to continue the mission.\n` +
      `\n` +
      `CONVERSATION TURNS:\n` +
      `${content}\n` +
      `\n` +
      `STRUCTURE:\n` +
      `## Mission Goal\n` +
      `[Current primary objective]\n` +
      `\n` +
      `## Progress & Done\n` +
      `[What was achieved, which files were modified, which tools were run]\n` +
      `\n` +
      `## Key Facts & Decisions\n` +
      `[Technical decisions, discovered paths, configuration values]\n` +
      `\n` +
      `## Remaining Work\n` +
      `[What is left to do]\n` +
      `\n` +
      `Be concise but technical. Include file paths and error messages if relevant.\n` +
      `Do NOT include preamble or greeting. Respond ONLY with the summary.\n`;

    if (this._previous_summary) {
      prompt = `Update the following summary with the new progress below:\n\nOLD SUMMARY:\n${this._previous_summary}\n\nNEW TURNS:\n${content}\n\n${prompt}`;
    }

    try {
      // Call the agent's internal LLM client via its summariser entry point.
      const fn = agent.generate_summary ?? agent.generateSummary;
      if (!fn) throw new Error("agent exposes no generate_summary");
      const summary = await fn.call(agent, prompt);
      return String(summary ?? "").trim();
    } catch (e) {
      error(`[COMPRESSOR] Summary generation failed: ${errText(e)}`);
      return `[Context Lost: Summary generation failed. ${turns.length} turns removed.]`;
    }
  }

  _serialize_turns(turns: CompressionMessage[]): string {
    const parts: string[] = [];
    for (const m of turns) {
      const role = String(m.role ?? "").toUpperCase();
      let content = String(m.content ?? "");
      if (content.length > 2000) {
        content = content.slice(0, 1000) + "... [truncated] ..." + content.slice(-500);
      }
      parts.push(`[${role}]: ${content}`);
    }
    return parts.join("\n\n");
  }

  /**
   * Ensure no orphaned tool calls/results.
   * Only drop tool results when the backend actually uses tool_call_id
   * (i.e. there are assistant messages with tool_calls). For llama.cpp
   * backends that use plain text tool calling, pass all tool messages through.
   */
  _sanitize(messages: CompressionMessage[]): CompressionMessage[] {
    // Check whether any assistant message in the list uses structured tool_calls
    const uses_tool_call_ids = messages.some(
      (m) => m.role === "assistant" && Boolean(m.tool_calls),
    );

    if (!uses_tool_call_ids) {
      // Plain-text tool calling (llama.cpp fallback) — nothing to sanitize
      return messages;
    }

    // Structured tool calling: drop tool results with no matching call ID
    const call_ids = new Set<string>();
    for (const m of messages) {
      if (m.role === "assistant" && m.tool_calls) {
        for (const tc of m.tool_calls) {
          call_ids.add(String(tc["id"]));
        }
      }
    }

    const final: CompressionMessage[] = [];
    for (const m of messages) {
      if (m.role === "tool") {
        if (!call_ids.has(String(m.tool_call_id))) {
          continue; // Drop orphaned tool result
        }
      }
      final.push(m);
    }
    return final;
  }
}
