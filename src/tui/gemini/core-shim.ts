/**
 * AXONIZ shim for @google/gemini-cli-core
 *
 * Provides stub implementations for all 63+ named exports that the
 * gemini-cli UI components import from @google/gemini-cli-core.
 *
 * This lets the gemini-cli UI source code (copied into src/tui/gemini/)
 * compile and run inside AXONIZ without the actual 896-file core package.
 *
 * Strategy:
 *   - Types → empty interfaces (TypeScript erases them at runtime)
 *   - Enums → objects with string values
 *   - Functions → minimal stubs that return sensible defaults
 *   - Classes → minimal classes with stub methods
 *
 * Over time, these stubs get replaced with real AXONIZ implementations.
 */
import { EventEmitter } from "node:events";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// ── Types (erased at compile time — just need declarations) ──────────────
export type Config = any;
export type AgentDefinition = any;
export type AgentOverride = any;
export type AnsiOutput = any;
export type AnsiToken = any;
export type AnsiLine = any;
export type AnyToolInvocation = any;
export type CustomTheme = any;
export type EditorType = any;
export type GeminiClient = any;
export type GeminiCLIExtension = any;
export type IdeInfo = any;
export type IdeContext = any;
export type LegacyAgentProtocol = any;
export type MCPServerConfig = any;
export type MessageActionReturn = any;
export type SubmitPromptActionReturn = any;
export type PolicyRule = any;
export type Question = any;
export type RetryAttemptPayload = any;
export type SerializableConfirmationDetails = any;
export type StartupWarning = any;
export type Storage = any;
export type SubagentState = any;
export type SubagentProgress = any;
export type SkillDefinition = any;
export type ThoughtSummary = any;
export type Todo = any;
export type TodoList = any;
export type ToolActionReturn = any;
export type ToolBuilder = any;
export type ToolCallStats = any;
export type ToolResult = any;
export type ToolCallDecision = any;
export type ToolVisibilityContext = any;
export type UserTierId = any;
export type WarningPriority = any;
export type WorkspaceContext = any;
export type CompressionStatus = any;
export type CompletionBehavior = any;
export type ConversationRecord = any;
export type Kind = any;

// ── Enums ────────────────────────────────────────────────────────────────
export const ApprovalMode = {
  DEFAULT: "default",
  AUTO_EDIT: "auto_edit",
  YOLO: "yolo",
} as const;

export const AuthType = {
  LOGIN_WITH_GOOGLE: "oauth-personal",
  GEMINI_API_KEY: "gemini-api-key",
  VERTEX_AI: "vertex-ai",
  CLOUD_SHELL: "cloud-shell",
} as const;

export const CoreToolCallStatus = {
  AwaitingApproval: "awaiting_approval",
  Pending: "pending",
  Executing: "executing",
  Success: "success",
  Error: "error",
  Cancelled: "cancelled",
} as const;

export const CoreEvent = {
  Feedback: "feedback",
  Telemetry: "telemetry",
} as const;

export const ExitCodes = {
  SUCCESS: 0,
  GENERIC_ERROR: 1,
  INTERRUPT: 130,
} as const;

export const LlmRole = {
  USER: "user",
  MODEL: "model",
} as const;

export const MCPServerStatus = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  FAILED: "failed",
} as const;

export const QuestionType = {
  CONFIRMATION: "confirmation",
  TEXT: "text",
  LIST: "list",
} as const;

export const WarningPriority = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export const CompletionBehavior = {
  APPEND: "append",
  REPLACE: "replace",
} as const;

// ── Constants ───────────────────────────────────────────────────────────
export const GEMINI_DIR = path.join(os.homedir(), ".gemini");
export const IDE_DEFINITIONS: any[] = [];

// ── Event emitter for core events ──────────────────────────────────────
export const coreEvents = new (class extends EventEmitter {
  emitFeedback(level: string, message: string) {
    this.emit("feedback", { level, message });
  }
})();

// ── Logger ─────────────────────────────────────────────────────────────
export class Logger {
  log(msg: string) { /* noop */ }
  error(msg: string) { /* noop */ }
  warn(msg: string) { /* noop */ }
  debug(msg: string) { /* noop */ }
}

export const debugLogger = {
  debug: (...args: any[]) => {},
  error: (...args: any[]) => {},
  warn: (...args: any[]) => {},
  info: (...args: any[]) => {},
};

// ── Telemetry ──────────────────────────────────────────────────────────
export const uiTelemetryService = {
  record: (_event: string, _data?: any) => {},
  flush: () => {},
};

// ── Utility functions ────────────────────────────────────────────────────
export function checkExhaustive(_value: never): never {
  throw new Error("checkExhaustive: unhandled case");
}

export function assumeExhaustive(_value: never): void {
  // no-op — for TypeScript exhaustiveness checking
}

export function isAppleTerminal(): boolean {
  return process.env.TERM_PROGRAM === "Apple_Terminal";
}

export function isTmux(): boolean {
  return Boolean(process.env.TMUX);
}

export function supportsTrueColor(): boolean {
  return process.env.COLORTERM === "truecolor";
}

export function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error;
}

export function isBinaryAvailable(name: string): boolean {
  try {
    require("node:child_process").execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function homedir(): string {
  return os.homedir();
}

export function escapePath(p: string): string {
  return p.replace(/ /g, "\\ ");
}

export function escapeShellArg(arg: string): string {
  return `"${arg.replace(/"/g, '\\"')}"`;
}

export function hasRedirection(cmd: string): boolean {
  return /[|<>]/.test(cmd);
}

export function getAbsoluteGitDir(cwd: string): string | null {
  try {
    const { execSync } = require("node:child_process");
    return execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function getDisplayString(model: any): string {
  if (typeof model === "string") return model;
  if (model?.name) return model.name;
  return "unknown";
}

export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function getAdminErrorMessage(): string | null {
  return null;
}

export function getMCPServerStatus(name: string): string {
  return MCPServerStatus.DISCONNECTED;
}

export function getVersion(): string {
  return "0.1.8-beta.1";
}

export function safeJsonToMarkdown(json: string): string {
  try {
    return "```json\n" + JSON.stringify(JSON.parse(json), null, 2) + "\n```";
  } catch {
    return "```json\n" + json + "\n```";
  }
}

export function tokenLimit(model: string): number {
  return 1_000_000; // generous default
}

export function recordFlickerFrame(_frame: any): void {
  // no-op
}

export function isUserVisibleHook(_hook: any): boolean {
  return false;
}

export function convertToRestPayload(_data: any): any {
  return _data;
}

export function performInit(): Promise<void> {
  return Promise.resolve();
}

export function clearApiKey(): Promise<void> {
  return Promise.resolve();
}

export function clearCachedCredentialFile(): Promise<void> {
  return Promise.resolve();
}

export function makeFakeConfig(): Config {
  return {
    getTargetDir: () => process.cwd(),
    getProjectRoot: () => process.cwd(),
    getContentGeneratorConfig: () => ({ authType: null }),
    getDebugMode: () => false,
    getSandboxEnabled: () => false,
    getUseTerminalBuffer: () => false,
    getUseAlternateBuffer: () => false,
    getScreenReader: () => false,
    getGeminiMdFileCount: () => 0,
    storage: { getStorageDir: () => path.join(os.homedir(), ".axoniz") },
  };
}

// ── Shell execution ──────────────────────────────────────────────────────
export class ShellExecutionService {
  async execute(cmd: string, _opts?: any): Promise<{ stdout: string; stderr: string; code: number }> {
    try {
      const { execSync } = require("node:child_process");
      const stdout = execSync(cmd, { encoding: "utf-8", timeout: 30_000 });
      return { stdout, stderr: "", code: 0 };
    } catch (e: any) {
      return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "", code: e.code ?? 1 };
    }
  }
}

export async function initializeShellParsers(): Promise<void> {
  // no-op — AXONIZ uses node's built-in child_process
}

export async function spawnAsync(cmd: string, args: string[], opts?: any): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const { spawn } = require("node:child_process");
    const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code: number) => resolve({ stdout, stderr, code }));
  });
}

// ── Classes ─────────────────────────────────────────────────────────────
export class NoopSandboxManager {
  isAvailable(): boolean { return false; }
  async init(): Promise<void> {}
  async executeInSandbox(cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return { stdout: "", stderr: "sandbox not available", code: 1 };
  }
}

export class IdeClient {
  static getInstance(): IdeClient { return new IdeClient(); }
  isRunning(): boolean { return false; }
  async getCurrentIDE(): Promise<IdeInfo | null> { return null; }
}

// ── MCP / Tool support ──────────────────────────────────────────────────
export type ToolCallDecision = "proceed" | "auto-edit" | "deny" | "cancel";

export const AgentDefinition = {};
export const ModelSlashCommandEvent = {};

// ── Additional stubs for missing exports ──
export type AgentsDiscoveredPayload = any;
export type ApiKeyUpdatedEvent = any;
export type AppContext = any;
export type ChangeAuthRequestedError = any;
export type ChatRecordingService = any;
export type ConsentRequestPayload = any;
export type GeminiUserTier = any;
export type HookSystemMessagePayload = any;
export type InjectionSource = any;
export type MemoryChangedPayload = any;
export type ProjectIdRequiredError = any;
export type ResizeObserver = any;
export type ResumedSessionData = any;
export type RetrieveUserQuotaResponse = any;
export type SessionEndReason = any;
export type SessionStartSource = any;
export type StaticRender = any;
export type StyledLine = any;
export type SubagentActivityItem = any;
export type ToolDisplay = any;
export type ToolResultDisplay = any;
export type UserFeedbackPayload = any;
export function buildUserSteeringHintPrompt(..._args: any[]): any { return undefined; }
export function disableLineWrapping(..._args: any[]): any { return undefined; }
export function disableMouseEvents(..._args: any[]): any { return undefined; }
export function enableMouseEvents(..._args: any[]): any { return undefined; }
export function enterAlternateScreen(..._args: any[]): any { return undefined; }
export function flattenMemory(..._args: any[]): any { return undefined; }
export function generateSummary(..._args: any[]): any { return undefined; }
export function getAllGeminiMdFilenames(..._args: any[]): any { return undefined; }
export function getBoundingBox(..._args: any[]): any { return undefined; }
export function ideContextStore(..._args: any[]): any { return undefined; }
export function isValidEditorType(..._args: any[]): any { return undefined; }
export function logBillingEvent(..._args: any[]): any { return undefined; }
export function recordExitFail(..._args: any[]): any { return undefined; }
export function saveApiKey(..._args: any[]): any { return undefined; }
export function shouldEnterAlternateScreen(..._args: any[]): any { return undefined; }
export function startupProfiler(..._args: any[]): any { return undefined; }
export function styledCharsWidth(..._args: any[]): any { return undefined; }
export function styledLineToString(..._args: any[]): any { return undefined; }
export function toStyledCharacters(..._args: any[]): any { return undefined; }
export function widestLineFromStyledChars(..._args: any[]): any { return undefined; }
export function wordBreakStyledChars(..._args: any[]): any { return undefined; }
export function wrapStyledChars(..._args: any[]): any { return undefined; }
export function writeToStdout(..._args: any[]): any { return undefined; }

export const ideContextStore = { get: () => null, set: () => {}, subscribe: () => () => {} };
export class ChatRecordingService { async start() {} async stop() {} async save() { return null; } }
export const startupProfiler = { start() {}, end() {}, record() {}, getReport() { return ""; } };

// ── Still-missing stubs (second pass) ──
export type AppContext = any;
export type ResizeObserver = any;
export type StaticRender = any;
export type StyledLine = any;
export const getBoundingBox = (...a: any[]) => (a[0] ?? 0);
export const styledCharsWidth = (...a: any[]) => (a[0] ?? 0);
export const styledLineToString = (...a: any[]) => (a[0] ?? 0);
export const toStyledCharacters = (...a: any[]) => (a[0] ?? 0);
export const widestLineFromStyledChars = (...a: any[]) => (a[0] ?? 0);
export const wordBreakStyledChars = (...a: any[]) => (a[0] ?? 0);
export const wrapStyledChars = (...a: any[]) => (a[0] ?? 0);

// ── Ink re-exports (gemini-cli expects these from ink but our version doesn't have them) ──
export const ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};
export const AppContext = { Provider: ({ children }: any) => children };
export const StaticRender = ({ children }: any) => children;
export type StyledLine = { text: string };
export function getBoundingBox() { return { width: process.stdout.columns ?? 80, height: process.stdout.rows ?? 24 }; }
export function styledCharsWidth(chars: any[]): number { return chars?.reduce((a: number, c: any) => a + (c?.text?.length ?? 0), 0) ?? 0; }
export function styledLineToString(line: any): string { return typeof line === 'string' ? line : line?.text ?? ''; }
export function toStyledCharacters(text: string): any[] { return [{ text }]; }
export function widestLineFromStyledChars(lines: any[]): number { return 0; }
export function wordBreakStyledChars(chars: any[], _w: number): any[] { return chars; }
export function wrapStyledChars(chars: any[], _w: number): any[] { return chars; }
