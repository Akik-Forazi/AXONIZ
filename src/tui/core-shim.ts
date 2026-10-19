/**
 * AXONIZ core-shim — replaces @google/gemini-cli-core with stubs.
 * Real AXONIZ implementations are injected at runtime by entry.tsx
 * via the _axonizRuntime container (ESM exports are frozen, so we
 * use a mutable container instead of monkey-patching).
 */
import { EventEmitter } from "node:events";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";

// ── Mutable runtime container ──
// entry.tsx sets these before rendering. The shim functions below
// read from this container, falling back to stubs when not set.
export const _axonizRuntime: {
  config: any;
  agent: any;
  agentProtocol: any;
} = {
  config: null,
  agent: null,
  agentProtocol: null,
};

// Event emitter
export const coreEvents = new EventEmitter();
(coreEvents as any).emitFeedback = (l: string, m: string) => coreEvents.emit("feedback", { level: l, message: m });

// Logger
export const debugLogger = { debug: (...a: any[]) => {}, error: (...a: any[]) => {}, warn: (...a: any[]) => {}, info: (...a: any[]) => {} };
export class Logger { log(_m: string) {} error(_m: string) {} warn(_m: string) {} debug(_m: string) {} }

// Constants
export const GEMINI_DIR = path.join(os.homedir(), ".gemini");
export const IDE_DEFINITIONS: any[] = [];
export const uiTelemetryService = { record: () => {}, flush: () => {} };

// Enums
export const ApprovalMode = { DEFAULT: "default", AUTO_EDIT: "auto_edit", YOLO: "yolo" } as const;
export const AuthType = { LOGIN_WITH_GOOGLE: "oauth-personal", GEMINI_API_KEY: "gemini-api-key", VERTEX_AI: "vertex-ai", CLOUD_SHELL: "cloud-shell" } as const;
export const CoreToolCallStatus = { AwaitingApproval: "awaiting_approval", Pending: "pending", Executing: "executing", Success: "success", Error: "error", Cancelled: "cancelled", Validating: "validating", Scheduled: "scheduled" } as const;
export const CoreEvent = { Feedback: "feedback", Telemetry: "telemetry" } as const;
export const ExitCodes = { SUCCESS: 0, GENERIC_ERROR: 1, INTERRUPT: 130 } as const;
export const LlmRole = { USER: "user", MODEL: "model" } as const;
export const MCPServerStatus = { CONNECTING: "connecting", CONNECTED: "connected", DISCONNECTED: "disconnected", FAILED: "failed" } as const;
export const QuestionType = { CONFIRMATION: "confirmation", TEXT: "text", LIST: "list" } as const;
export const WarningPriority = { HIGH: "high", MEDIUM: "medium", LOW: "low" } as const;
export const CompletionBehavior = { APPEND: "append", REPLACE: "replace" } as const;
export const ModelSlashCommandEvent = {};
export const AgentDefinition = {};

// Utility functions
export function checkExhaustive(_v: never): never { throw new Error("checkExhaustive"); }
export function assumeExhaustive(_v: never): void {}
export function isAppleTerminal(): boolean { return process.env.TERM_PROGRAM === "Apple_Terminal"; }
export function isTmux(): boolean { return Boolean(process.env.TMUX); }
export function supportsTrueColor(): boolean { return process.env.COLORTERM === "truecolor"; }
export function isNodeError(e: unknown): e is NodeJS.ErrnoException { return e instanceof Error; }
export function isBinaryAvailable(n: string): boolean { try { execSync("which " + n, { stdio: "ignore" }); return true; } catch { return false; } }
export function homedir(): string { return os.homedir(); }
export function escapePath(p: string): string { return p.replace(/ /g, "\\ "); }
export function escapeShellArg(a: string): string { return JSON.stringify(a); }
export function hasRedirection(c: string): boolean { return /[|<>]/.test(c); }
export function getAbsoluteGitDir(c: string): string | null { try { return execSync("git rev-parse --show-toplevel", { cwd: c, encoding: "utf-8" }).trim(); } catch { return null; } }
export function getDisplayString(m: any): string { return typeof m === "string" ? m : m?.name ?? "unknown"; }
export function getErrorMessage(e: unknown): string { return e instanceof Error ? e.message : String(e); }
export function getAdminErrorMessage(): string | null { return null; }
export function getMCPServerStatus(_n: string): string { return MCPServerStatus.DISCONNECTED; }
export function getVersion(): string { return "0.1.8-beta.1"; }
export function tokenLimit(_m: string): number { return 1000000; }
export function recordFlickerFrame(_f: any): void {}
export function isUserVisibleHook(_h: any): boolean { return false; }
export function convertToRestPayload(d: any): any { return d; }
export function performInit(): Promise<void> { return Promise.resolve(); }
export function clearApiKey(): Promise<void> { return Promise.resolve(); }
export function clearCachedCredentialFile(): Promise<void> { return Promise.resolve(); }
export function makeFakeConfig(): any {
  // Use real AXONIZ config adapter if injected by entry.tsx
  if (_axonizRuntime.config) return _axonizRuntime.config;
  // Fall back to stub
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
    getAgentSessionInteractiveEnabled: () => true,
    getGeminiClient: () => null,
    getApprovalMode: () => "default",
    getPreferredEditor: () => process.env.EDITOR ?? "vim",
    storage: { getStorageDir: () => path.join(os.homedir(), ".axoniz") },
    injectionService: { inject: () => {} },
  };
}
export function disableMouseEvents(): void {}
export function enableMouseEvents(): void {}
export function enterAlternateScreen(): void {}
export function disableLineWrapping(): void {}
export function shouldEnterAlternateScreen(): boolean { return false; }
export function writeToStdout(d: string): void { process.stdout.write(d); }
export function getAllGeminiMdFilenames(): string[] { return []; }
export function isValidEditorType(_t: string): boolean { return true; }
export function flattenMemory(d: any): any { return d; }
export function recordExitFail(_c: number): void {}
export function saveApiKey(_k: string): Promise<void> { return Promise.resolve(); }
export function logBillingEvent(_e: any): void {}
export function buildUserSteeringHintPrompt(): string { return ""; }
export function generateSummary(t: string): string { return t; }
export function getBoundingBox() { return { width: process.stdout.columns ?? 80, height: process.stdout.rows ?? 24 }; }
export function styledCharsWidth(c: any[]): number { return c?.reduce((a: number, x: any) => a + (x?.text?.length ?? 0), 0) ?? 0; }
export function styledLineToString(l: any): string { return typeof l === "string" ? l : l?.text ?? ""; }
export function toStyledCharacters(t: string): any[] { return [{ text: t }]; }
export function widestLineFromStyledChars(_l: any[]): number { return 0; }
export function wordBreakStyledChars(c: any[], _w: number): any[] { return c; }
export function wrapStyledChars(c: any[], _w: number): any[] { return c; }
export function safeJsonToMarkdown(j: string): string {
  try {
    return "```json\n" + JSON.stringify(JSON.parse(j), null, 2) + "\n```";
  } catch {
    return "```json\n" + j + "\n```";
  }
}

export function spawnAsync(cmd: string, a: string[], o?: any): Promise<{stdout:string;stderr:string;code:number}> {
  return new Promise(r => {
    const c = spawn(cmd, a, { ...o, stdio: ["ignore","pipe","pipe"] });
    let so = "", se = "";
    c.stdout?.on("data", (d: Buffer) => so += d);
    c.stderr?.on("data", (d: Buffer) => se += d);
    c.on("close", (code: number) => r({ stdout: so, stderr: se, code }));
  });
}

export async function initializeShellParsers(): Promise<void> {}

// Classes
export class NoopSandboxManager { isAvailable() { return false; } async init() {} async executeInSandbox(_c: string) { return { stdout: "", stderr: "no sandbox", code: 1 }; } }
export class IdeClient { static getInstance() { return new IdeClient(); } isRunning() { return false; } async getCurrentIDE() { return null; } }
export class ChatRecordingService { async start() {} async stop() {} async save() { return null; } }
export class ShellExecutionService {
  async execute(cmd: string) {
    try { return { stdout: execSync(cmd, { encoding: "utf-8", timeout: 30000 }), stderr: "", code: 0 }; }
    catch (e: any) { return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "", code: e.code ?? 1 }; }
  }
}
export class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
export const AppContext = { Provider: ({ children }: any) => children };
export const StaticRender = ({ children }: any) => children;
export const ideContextStore = { get: () => null, set: () => {}, subscribe: () => () => {} };
export const startupProfiler = { start() {}, end() {}, record() {}, getReport() { return ""; } };

// Types (all any — erased at compile time)
export type Config = any;
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
export type WorkspaceContext = any;
export type CompressionStatus = any;
export type ConversationRecord = any;
export type Kind = any;
export type GeminiUserTier = any;
export type UserFeedbackPayload = any;
export type HookSystemMessagePayload = any;
export type ResumedSessionData = any;
export type MemoryChangedPayload = any;
export type AgentsDiscoveredPayload = any;
export type ApiKeyUpdatedEvent = any;
export type ConsentRequestPayload = any;
export type InjectionSource = any;
export type SessionEndReason = any;
export type SessionStartSource = any;
export type RetrieveUserQuotaResponse = any;
export type ProjectIdRequiredError = any;
export type ChangeAuthRequestedError = any;
export type ToolDisplay = any;
export type ToolResultDisplay = any;
export type StyledLine = any;
export type SubagentActivityItem = any;
