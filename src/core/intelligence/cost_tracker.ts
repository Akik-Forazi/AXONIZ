/**
 * Per-task cost attribution — tracks tokens in/out + $ cost per tool
 * call and per LLM call, aggregated per task.
 *
 * Emits SSE events for live dashboard updates via the onCost callback.
 *
 * Usage:
 *   const tracker = new CostTracker({
 *     inputPricePerMTok: 0,
 *     outputPricePerMTok: 0,
 *   });
 *   tracker.recordLLMCall(842, 142, 380);
 *   tracker.recordToolCall("file_read", 240, 0, 12);
 *   const total = tracker.getTaskTotal();
 *   // → { tokensIn: 1082, tokensOut: 142, costUsd: 0, toolCalls: 1, llmCalls: 1, durationMs: 392 }
 *
 * For local providers (llama.cpp, LM Studio, Ollama), prices are 0
 * (the cost is hardware depreciation, not per-token billing).
 */

import { broker } from "../../web/broker.js";

export interface CostTrackerPricing {
  /** USD per 1 million input tokens. 0 for local providers. */
  inputPricePerMTok: number;
  /** USD per 1 million output tokens. 0 for local providers. */
  outputPricePerMTok: number;
}

export interface ToolCallCost {
  tool: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  ts: number;
}

export interface LLMCallCost {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  ts: number;
  model?: string;
}

export interface TaskCostTotal {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  toolCalls: number;
  llmCalls: number;
  durationMs: number;
  startedAt: number;
  endedAt: number;
}

export interface CostEvent {
  type: "tool" | "llm";
  entry: ToolCallCost | LLMCallCost;
  runningTotal: TaskCostTotal;
}

export class CostTracker {
  private toolCalls: ToolCallCost[] = [];
  private llmCalls: LLMCallCost[] = [];
  private pricing: CostTrackerPricing;
  private startedAt: number = Date.now();
  private taskId: string;

  /** Optional callback for live SSE emission. */
  onCost?: (event: CostEvent) => void;

  constructor(taskId: string, pricing: CostTrackerPricing) {
    this.taskId = taskId;
    this.pricing = pricing;
  }

  /** Record a tool call's token usage + duration. */
  recordToolCall(
    tool: string,
    tokensIn: number,
    tokensOut: number,
    durationMs: number,
  ): void {
    const costUsd =
      (tokensIn * this.pricing.inputPricePerMTok +
        tokensOut * this.pricing.outputPricePerMTok) /
      1_000_000;
    const entry: ToolCallCost = {
      tool,
      tokensIn,
      tokensOut,
      costUsd,
      durationMs,
      ts: Date.now() / 1000,
    };
    this.toolCalls.push(entry);
    this.emit("tool", entry);
  }

  /** Record an LLM call's token usage + duration. */
  recordLLMCall(
    tokensIn: number,
    tokensOut: number,
    durationMs: number,
    model?: string,
  ): void {
    const costUsd =
      (tokensIn * this.pricing.inputPricePerMTok +
        tokensOut * this.pricing.outputPricePerMTok) /
      1_000_000;
    const entry: LLMCallCost = {
      tokensIn,
      tokensOut,
      costUsd,
      durationMs,
      ts: Date.now() / 1000,
      model,
    };
    this.llmCalls.push(entry);
    this.emit("llm", entry);
  }

  /** Get the running total for this task. */
  getTaskTotal(): TaskCostTotal {
    const tokensIn = this.toolCalls.reduce((s, c) => s + c.tokensIn, 0) +
      this.llmCalls.reduce((s, c) => s + c.tokensIn, 0);
    const tokensOut = this.toolCalls.reduce((s, c) => s + c.tokensOut, 0) +
      this.llmCalls.reduce((s, c) => s + c.tokensOut, 0);
    const costUsd = this.toolCalls.reduce((s, c) => s + c.costUsd, 0) +
      this.llmCalls.reduce((s, c) => s + c.costUsd, 0);
    const durationMs = this.toolCalls.reduce((s, c) => s + c.durationMs, 0) +
      this.llmCalls.reduce((s, c) => s + c.durationMs, 0);
    return {
      tokensIn,
      tokensOut,
      costUsd,
      toolCalls: this.toolCalls.length,
      llmCalls: this.llmCalls.length,
      durationMs,
      startedAt: this.startedAt / 1000,
      endedAt: Date.now() / 1000,
    };
  }

  /** Reset for a new task. */
  reset(newTaskId?: string): void {
    this.toolCalls = [];
    this.llmCalls = [];
    this.startedAt = Date.now();
    if (newTaskId) this.taskId = newTaskId;
  }

  /** Get the task ID. */
  get id(): string {
    return this.taskId;
  }

  /** Emit a cost event to the SSE broker + the onCost callback. */
  private emit(type: "tool" | "llm", entry: ToolCallCost | LLMCallCost): void {
    const event: CostEvent = {
      type,
      entry,
      runningTotal: this.getTaskTotal(),
    };
    this.onCost?.(event);
    // Broadcast to any connected SSE clients (the web UI event rail picks this up)
    try {
      broker.broadcast("cost", event);
    } catch {
      /* broker may not be available in all environments */
    }
  }
}
