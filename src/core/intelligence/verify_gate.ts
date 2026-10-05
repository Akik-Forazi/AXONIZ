/**
 * Verify Gate — actually runs tsc, eslint, vitest, pytest after code
 * changes and parses the real results.
 *
 * Replaces the LLM-only _verify() in src/core/loop.ts which asked the
 * LLM "did this succeed?" (expensive + unreliable — LLMs hallucinate
 * success). The VerifyGate runs deterministic checks and reports
 * concrete errors with line numbers.
 *
 * Canonical verification chain for code changes:
 *   Change → Compile (tsc) → Lint (eslint) → Unit Tests (vitest/pytest) → Behavior → Regression → Review
 *
 * Usage:
 *   const gate = new VerifyGate(workspace);
 *   const result = await gate.run(["tsc", "eslint", "vitest"]);
 *   if (result.ok) { console.log("All checks passed"); }
 *   else { console.log(result.summary); }
 *
 * Each check is independent — if tsc fails, eslint and vitest still run
 * so you get the full picture.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface VerifyCheck {
  name: string;
  passed: boolean;
  output: string;
  errors: number;
  warnings: number;
  durationMs: number;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
  summary: string;
  totalDurationMs: number;
}

export type VerifyCheckName = "tsc" | "eslint" | "vitest" | "pytest" | "mypy" | "flake8";

export class VerifyGate {
  constructor(private workspace: string = ".") {}

  /**
   * Run the specified checks in sequence. Each check is independent —
   * a failure in one doesn't stop the others.
   *
   * Checks that aren't applicable to the workspace (e.g. vitest when
   * there's no vitest config) are skipped with a "skipped" note.
   */
  async run(checks: VerifyCheckName[]): Promise<VerifyResult> {
    const results: VerifyCheck[] = [];
    for (const check of checks) {
      const result = await this.runCheck(check);
      results.push(result);
    }
    const ok = results.every((r) => r.passed);
    const summary = this.summarize(results);
    const totalDurationMs = results.reduce((s, r) => s + r.durationMs, 0);
    return { ok, checks: results, summary, totalDurationMs };
  }

  /** Run a single check by name. */
  private async runCheck(name: VerifyCheckName): Promise<VerifyCheck> {
    const start = Date.now();
    try {
      switch (name) {
        case "tsc":
          return await this.runTsc(start);
        case "eslint":
          return await this.runEslint(start);
        case "vitest":
          return await this.runVitest(start);
        case "pytest":
          return await this.runPytest(start);
        case "mypy":
          return await this.runMypy(start);
        case "flake8":
          return await this.runFlake8(start);
        default:
          return {
            name,
            passed: false,
            output: `Unknown check: ${name}`,
            errors: 1,
            warnings: 0,
            durationMs: Date.now() - start,
          };
      }
    } catch (e) {
      return {
        name,
        passed: false,
        output: `Exception: ${e instanceof Error ? e.message : String(e)}`,
        errors: 1,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /* ── TypeScript: tsc --noEmit ────────────────────────────────────── */

  private async runTsc(start: number): Promise<VerifyCheck> {
    if (!this.hasFile("tsconfig.json")) {
      return this.skipped("tsc", "no tsconfig.json", start);
    }
    try {
      const output = execSync("npx tsc --noEmit 2>&1", {
        cwd: this.workspace,
        timeout: 60_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      // tsc exits 0 on success, non-zero on errors
      const errors = (output.match(/error TS\d+:/g) ?? []).length;
      return {
        name: "tsc",
        passed: errors === 0,
        output: output || "No errors.",
        errors,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const output = (e as { stdout?: string; stderr?: string }).stdout ?? (e as Error).message ?? "";
      const errors = (output.match(/error TS\d+:/g) ?? []).length;
      return {
        name: "tsc",
        passed: false,
        output: output || String(e),
        errors: errors || 1,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /* ── ESLint ────────────────────────────────────────────────────────── */

  private async runEslint(start: number): Promise<VerifyCheck> {
    if (!this.hasFile("eslint.config.mjs") && !this.hasFile(".eslintrc.js") && !this.hasFile(".eslintrc.json")) {
      return this.skipped("eslint", "no eslint config", start);
    }
    try {
      const output = execSync("npx eslint . --max-warnings=0 2>&1", {
        cwd: this.workspace,
        timeout: 60_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const errors = (output.match(/\d+ error/g) ?? []).length;
      const warnings = (output.match(/\d+ warning/g) ?? []).length;
      return {
        name: "eslint",
        passed: errors === 0,
        output: output || "No lint issues.",
        errors,
        warnings,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const output = (e as { stdout?: string }).stdout ?? String(e);
      const errorMatch = output.match(/(\d+) error/);
      const warningMatch = output.match(/(\d+) warning/);
      const errors = errorMatch ? Number(errorMatch[1]) : 1;
      const warnings = warningMatch ? Number(warningMatch[1]) : 0;
      return {
        name: "eslint",
        passed: false,
        output: output || String(e),
        errors,
        warnings,
        durationMs: Date.now() - start,
      };
    }
  }

  /* ── Vitest (TypeScript/JS unit tests) ─────────────────────────────── */

  private async runVitest(start: number): Promise<VerifyCheck> {
    if (!this.hasFile("vitest.config.ts") && !this.hasFile("vitest.config.js") && !this.hasFile("vite.config.ts")) {
      return this.skipped("vitest", "no vitest config", start);
    }
    try {
      const output = execSync("npx vitest run 2>&1", {
        cwd: this.workspace,
        timeout: 120_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      // Vitest outputs "Test Files  X passed (Y)" or "X failed (Y)"
      const failed = (output.match(/(\d+) failed/) ?? [])[1];
      const errors = failed ? Number(failed) : 0;
      return {
        name: "vitest",
        passed: errors === 0,
        output,
        errors,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const output = (e as { stdout?: string }).stdout ?? String(e);
      const failed = (output.match(/(\d+) failed/) ?? [])[1];
      const errors = failed ? Number(failed) : 1;
      return {
        name: "vitest",
        passed: false,
        output: output || String(e),
        errors,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /* ── Pytest (Python unit tests) ─────────────────────────────────────── */

  private async runPytest(start: number): Promise<VerifyCheck> {
    if (!this.hasAnyFile(["pytest.ini", "pyproject.toml", "setup.cfg"]) && !this.hasDir("tests")) {
      return this.skipped("pytest", "no pytest config or tests/ dir", start);
    }
    try {
      const output = execSync("python -m pytest --tb=short 2>&1", {
        cwd: this.workspace,
        timeout: 120_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const failed = (output.match(/(\d+) failed/) ?? [])[1];
      const errors = failed ? Number(failed) : 0;
      return {
        name: "pytest",
        passed: errors === 0,
        output,
        errors,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const output = (e as { stdout?: string }).stdout ?? String(e);
      const failed = (output.match(/(\d+) failed/) ?? [])[1];
      const errors = failed ? Number(failed) : 1;
      return {
        name: "pytest",
        passed: false,
        output: output || String(e),
        errors,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /* ── mypy (Python type checking) ───────────────────────────────────── */

  private async runMypy(start: number): Promise<VerifyCheck> {
    if (!this.hasAnyFile(["mypy.ini", "pyproject.toml"])) {
      return this.skipped("mypy", "no mypy config", start);
    }
    try {
      const output = execSync("python -m mypy . 2>&1", {
        cwd: this.workspace,
        timeout: 60_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const errors = (output.match(/error:/gi) ?? []).length;
      return {
        name: "mypy",
        passed: errors === 0,
        output,
        errors,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const output = (e as { stdout?: string }).stdout ?? String(e);
      const errors = (output.match(/error:/gi) ?? []).length;
      return {
        name: "mypy",
        passed: false,
        output: output || String(e),
        errors: errors || 1,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /* ── flake8 (Python linting) ────────────────────────────────────────── */

  private async runFlake8(start: number): Promise<VerifyCheck> {
    if (!this.hasAnyFile([".flake8", "setup.cfg", "tox.ini"])) {
      return this.skipped("flake8", "no flake8 config", start);
    }
    try {
      const output = execSync("python -m flake8 . 2>&1", {
        cwd: this.workspace,
        timeout: 60_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const errors = output.trim().split("\n").filter((l) => l.trim()).length;
      return {
        name: "flake8",
        passed: errors === 0,
        output: output || "No lint issues.",
        errors,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const output = (e as { stdout?: string }).stdout ?? String(e);
      const errors = output.trim().split("\n").filter((l) => l.trim()).length;
      return {
        name: "flake8",
        passed: false,
        output: output || String(e),
        errors: errors || 1,
        warnings: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /* ── helpers ────────────────────────────────────────────────────────── */

  private hasFile(name: string): boolean {
    try {
      return fs.statSync(path.join(this.workspace, name)).isFile();
    } catch {
      return false;
    }
  }

  private hasAnyFile(names: string[]): boolean {
    return names.some((n) => this.hasFile(n));
  }

  private hasDir(name: string): boolean {
    try {
      return fs.statSync(path.join(this.workspace, name)).isDirectory();
    } catch {
      return false;
    }
  }

  private skipped(name: string, reason: string, start: number): VerifyCheck {
    return {
      name,
      passed: true, // skipped = pass (not applicable)
      output: `Skipped: ${reason}`,
      errors: 0,
      warnings: 0,
      durationMs: Date.now() - start,
    };
  }

  private summarize(results: VerifyCheck[]): string {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const skipped = results.filter((r) => r.output.startsWith("Skipped:")).length;
    const parts: string[] = [];
    for (const r of results) {
      if (r.output.startsWith("Skipped:")) {
        parts.push(`${r.name}: skipped (${r.output.slice(9)})`);
      } else if (r.passed) {
        parts.push(`${r.name}: passed (${r.durationMs}ms)`);
      } else {
        parts.push(`${r.name}: FAILED (${r.errors} errors, ${r.warnings} warnings, ${r.durationMs}ms)`);
      }
    }
    return `${passed - skipped} passed, ${failed} failed, ${skipped} skipped\n  ${parts.join("\n  ")}`;
  }
}
