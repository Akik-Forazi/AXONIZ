/**
 * AXONIZ Config adapter — wraps AXONIZ's config object with the methods
 * that the gemini-cli UI components expect from a Config instance.
 *
 * The gemini-cli UI calls:
 *   config.getTargetDir()           — cwd for file operations
 *   config.getProjectRoot()          — project root path
 *   config.getContentGeneratorConfig() — auth info (returns {authType})
 *   config.getDebugMode()            — debug flag
 *   config.getSandboxEnabled()       — sandbox flag
 *   config.getUseTerminalBuffer()    — terminal buffer flag
 *   config.getUseAlternateBuffer()   — alternate screen buffer
 *   config.getScreenReader()         — screen reader accessibility
 *   config.getGeminiMdFileCount()    — context file count (AXONIZ: 0)
 *   config.getAgentSessionInteractiveEnabled() — true = use useAgentStream
 *   config.getGeminiClient()         — null = skip useGeminiStream
 *   config.getApprovalMode()         — approval mode enum
 *   config.getPreferredEditor()      — editor type
 *   config.storage                   — storage object
 *   config.injectionService          — injection service
 *
 * We map AXONIZ's config to these calls.
 */
import path from "node:path";
import os from "node:os";

export class AxonizConfigAdapter {
  constructor(private config: Record<string, unknown>) {}

  getTargetDir(): string {
    return String(this.config.workspace ?? process.cwd());
  }

  getProjectRoot(): string {
    return String(this.config.workspace ?? process.cwd());
  }

  getContentGeneratorConfig(): { authType: string | null } {
    // AXONIZ doesn't have Google auth types — return null so the UI
    // skips the Google login flow
    return { authType: null };
  }

  getDebugMode(): boolean {
    return Boolean(process.env.AXONIZ_DEBUG);
  }

  getSandboxEnabled(): boolean {
    return false;
  }

  getUseTerminalBuffer(): boolean {
    return false;
  }

  getUseAlternateBuffer(): boolean {
    return false;
  }

  getScreenReader(): boolean {
    return false;
  }

  getGeminiMdFileCount(): number {
    // AXONIZ doesn't use GEMINI.md — use AXONIZ.md instead
    const axonizMd = path.join(this.getTargetDir(), "AXONIZ.md");
    try {
      require("node:fs").accessSync(axonizMd);
      return 1;
    } catch {
      return 0;
    }
  }

  getAgentSessionInteractiveEnabled(): boolean {
    // Return true so AppContainer uses useAgentStream (not useGeminiStream)
    return true;
  }

  getGeminiClient(): null {
    // Return null so AppContainer skips the Gemini streaming path
    return null;
  }

  getApprovalMode(): string {
    return "default";
  }

  getPreferredEditor(): string {
    return process.env.EDITOR ?? "vim";
  }

  get storage(): { getStorageDir: () => string } {
    return {
      getStorageDir: () => path.join(os.homedir(), ".axoniz"),
    };
  }

  get injectionService(): { inject: (msg: string) => void } {
    return { inject: (_msg: string) => {} };
  }

  // Additional methods that AppContainer might call
  getScreenReaderModeEnabled(): boolean { return false; }
  getModel(): string {
    const llm = this.config.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
    const prov = String(this.config.provider ?? this.config.backend ?? llm?.active_provider ?? "llamacpp");
    const pCfg = llm?.providers?.[prov] ?? {};
    return String(pCfg.model_name ?? "auto");
  }

  // Pass-through for unknown method calls — return undefined instead of crashing
  // This lets the gemini-cli UI call methods we haven't implemented yet
  // without crashing the entire app
  [key: string]: any;
}
