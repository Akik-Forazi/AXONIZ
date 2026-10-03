/**
 * axoniz.core.intelligence.ast_index
 * =====================================
 * Phase 3 — Living Codebase Understanding
 *
 * Cursor and Copilot do text search. They're glorified grep.
 * axoniz builds a real AST index of your entire workspace:
 *   - Every class, function, method, variable
 *   - Every import and what imports what
 *   - Every call site (who calls what)
 *   - Symbol cross-references
 *   - "What will break if I change X?"
 *
 * Before editing anything, axoniz knows what will break.
 * After editing, it compares semantic meaning, not just text.
 *
 * Storage: SQLite at ~/.axoniz/ast_indexes/ast_<hash>.db (per workspace)
 * Incremental: only re-indexes changed files (mtime-based)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PORT DESIGN DECISION — how Python's `ast` module was replaced
 * ────────────────────────────────────────────────────────────────────────────
 * Python parsed source with `ast.parse()` and an `ast.NodeVisitor`. Node has no
 * built-in parser and the brief forbids adding a parser dependency
 * (`typescript` is a devDependency and must not be imported from `src/`), so
 * this module ships a **heuristic symbol/relationship extractor** that produces
 * the *same output shape*: the same `symbols` / `imports` / `calls` tables, the
 * same `Symbol` / `CallSite` / `ImpactAnalysis` objects and the same query
 * results.
 *
 *   • Python files use an indentation-driven scanner (`class` / `def` / `async
 *     def` / `import` / `from ... import` / module- and class-level
 *     assignments / dotted call chains).
 *   • TypeScript/JavaScript files use a brace-driven scanner (classes,
 *     interfaces/type/enum, function declarations, arrow & function
 *     expressions, class methods, ESM/CJS imports, call chains). Python's
 *     indexer only globbed `.py`; the port indexes TS/JS as well because the
 *     ported codebase *is* TypeScript — without it the index would be empty and
 *     `impact_analysis` useless. `_find_python_files()` is kept for callers that
 *     want the original `.py`-only behaviour.
 *
 * Fidelity that is LOST versus `ast`:
 *   1. No true parse tree. Anything that needs real syntax resolution is
 *      approximate: multi-line call argument lists are under-counted
 *      (`args_count`), calls hidden inside f-strings/comprehensions may be
 *      missed, and decorators are attributed to the decorated definition's line
 *      (Python reported the `def` line too, so this matches).
 *   2. `def`/`class` body extents (`line_end`) come from indentation (Python) or
 *      brace matching (TS) rather than `node.end_lineno`.
 *   3. Docstrings are detected only when the first statement of a body is a
 *      string literal; `inspect.cleandoc` de-denting is approximated.
 *   4. `parent` attribution uses the innermost enclosing class found by
 *      indentation/braces; Python used the visitor's `_current_class`.
 *   5. TypeScript `interface` / `type` / `enum` declarations are recorded with
 *      kind `"class"` so the `by_kind` histogram keeps exactly Python's kind set
 *      (class/function/method/variable).
 *   6. The `symbol_refs` table is created, per-file cleared and indexed but left
 *      unpopulated — exactly as in `ast_index.py` (its `_ASTVisitor` never
 *      appended to `symbol_refs`).
 *
 * `index_workspace()` stays synchronous so its callers (the `ast_reindex` tool,
 * `_t_reindex`) keep returning a value rather than a Promise. Background use
 * goes through `index_workspace_async()`, which drives the same work in bounded
 * batches and yields to the event loop between them.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { AXONIZ_HOME } from "../config.js";
import { debug, warn } from "../debug.js";

export const AST_INDEX_DIR = path.join(AXONIZ_HOME, "ast_indexes");
try {
  fs.mkdirSync(AST_INDEX_DIR, { recursive: true });
} catch {
  /* best effort, mirrors makedirs(exist_ok=True) */
}

const _SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS files (
    path        TEXT PRIMARY KEY,
    mtime       REAL,
    size        INTEGER,
    hash        TEXT,
    language    TEXT DEFAULT 'python',
    indexed_at  REAL
);

CREATE TABLE IF NOT EXISTS symbols (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,  -- class/function/method/variable/import
    line_start  INTEGER,
    line_end    INTEGER,
    parent      TEXT,           -- class name if method
    signature   TEXT,           -- full def line
    docstring   TEXT,
    is_public   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS imports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    module      TEXT NOT NULL,
    names       TEXT,           -- JSON list of imported names
    alias       TEXT,
    line        INTEGER,
    is_from     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    caller      TEXT,           -- function/method making the call
    callee      TEXT NOT NULL,  -- function/attribute being called
    line        INTEGER,
    args_count  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS symbol_refs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    line        INTEGER,
    context     TEXT
);

CREATE INDEX IF NOT EXISTS idx_sym_name   ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_sym_kind   ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_sym_file   ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_imp_module ON imports(module);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee);
CREATE INDEX IF NOT EXISTS idx_ref_symbol ON symbol_refs(symbol_name);
`;

/** Extension → language label written into `files.language`. */
export const INDEX_EXTENSIONS: Record<string, string> = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
};

const SKIP_DIRS = new Set([
  ".git",
  "__pycache__",
  "node_modules",
  ".egg-info",
  "dist",
  "build",
  ".axoniz",
  "venv",
  "env",
  ".venv",
]);

/* ── Data types ───────────────────────────────────────────────────────────── */

export interface SymbolInit {
  name: string;
  kind: string; // class / function / method / variable / import
  file_path: string;
  line: number;
  signature?: string;
  docstring?: string;
  parent?: string;
}

export class Symbol {
  name: string;
  kind: string;
  file_path: string;
  line: number;
  signature: string;
  docstring: string;
  parent: string;

  constructor(
    init: SymbolInit | string,
    kind?: string,
    file_path?: string,
    line?: number,
    signature = "",
    docstring = "",
    parent = "",
  ) {
    const o: SymbolInit =
      typeof init === "string"
        ? {
            name: init,
            kind: kind ?? "",
            file_path: file_path ?? "",
            line: line ?? 0,
            signature,
            docstring,
            parent,
          }
        : init;
    this.name = o.name;
    this.kind = o.kind;
    this.file_path = o.file_path;
    this.line = o.line;
    this.signature = o.signature ?? "";
    this.docstring = o.docstring ?? "";
    this.parent = o.parent ?? "";
  }

  get filePath(): string {
    return this.file_path;
  }
}

export interface CallSiteInit {
  file_path: string;
  caller: string;
  callee: string;
  line: number;
}

export class CallSite {
  file_path: string;
  caller: string;
  callee: string;
  line: number;

  constructor(init: CallSiteInit | string, caller?: string, callee?: string, line?: number) {
    const o: CallSiteInit =
      typeof init === "string"
        ? { file_path: init, caller: caller ?? "", callee: callee ?? "", line: line ?? 0 }
        : init;
    this.file_path = o.file_path;
    this.caller = o.caller;
    this.callee = o.callee;
    this.line = o.line;
  }

  get filePath(): string {
    return this.file_path;
  }
}

export interface ImpactAnalysisInit {
  symbol: string;
  direct_calls: CallSite[];
  affected_files: string[];
  risk_level: string; // low / medium / high / critical
  summary: string;
}

export class ImpactAnalysis {
  symbol: string;
  direct_calls: CallSite[];
  affected_files: string[];
  risk_level: string;
  summary: string;

  constructor(init: ImpactAnalysisInit) {
    this.symbol = init.symbol;
    this.direct_calls = init.direct_calls;
    this.affected_files = init.affected_files;
    this.risk_level = init.risk_level;
    this.summary = init.summary;
  }

  get directCalls(): CallSite[] {
    return this.direct_calls;
  }
  get affectedFiles(): string[] {
    return this.affected_files;
  }
  get riskLevel(): string {
    return this.risk_level;
  }
}

export interface IndexStats {
  files_indexed: number;
  files_new: number;
  files_changed: number;
  files_skipped: number;
  total: number;
}

export interface AstStats {
  files_indexed: number;
  symbols: number;
  calls: number;
  imports: number;
  by_kind: Record<string, number>;
}

/* ── Extraction primitives ────────────────────────────────────────────────── */

export interface ExtractedSymbol {
  name: string;
  kind: string;
  line: number;
  line_end: number;
  parent: string;
  signature: string;
  docstring: string;
}

export interface ExtractedImport {
  module: string;
  names: string[];
  alias: string;
  line: number;
  is_from: boolean;
}

export interface ExtractedCall {
  caller: string;
  callee: string;
  line: number;
  args_count: number;
}

export interface Extraction {
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
  calls: ExtractedCall[];
}

/** Identifiers that look like calls but are language keywords, not functions. */
const NOT_CALLS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "typeof",
  "await",
  "function",
  "class",
  "import",
  "export",
  "delete",
  "void",
  "in",
  "of",
  "do",
  "else",
  "try",
  "finally",
  "throw",
  "case",
  "default",
  "const",
  "let",
  "var",
  "new",
  "yield",
  "with",
  "elif",
  "except",
  "lambda",
  "and",
  "or",
  "not",
  "is",
  "assert",
  "del",
  "global",
  "nonlocal",
  "def",
  "raise",
  "pass",
  "break",
  "continue",
  "assert",
]);

/**
 * Rough replacement for `len(call_node.args)`: count top-level argument
 * segments, ignoring keyword arguments (`name=value`) and `**kwargs`, which
 * Python's AST stores outside `node.args`.
 */
function _countArgs(text: string): number {
  const body = text.trim();
  if (!body) return 0;
  const segments: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quote) {
      current += ch;
      if (ch === quote && body[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.filter((s) => {
    const t = s.trim();
    if (!t) return false;
    if (t.startsWith("**")) return false; // Python: keywords, not args
    if (/^[A-Za-z_$][\w$]*\s*=(?!=)/.test(t)) return false; // keyword argument
    return true;
  }).length;
}

/** Extract the parenthesised argument text that follows `(` at `openIdx`. */
function _argTextAfter(line: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return line.slice(openIdx + 1, i);
    }
  }
  return line.slice(openIdx + 1);
}

function _indentWidth(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === " " || line[n] === "\t")) n++;
  return n;
}

/* ── Python heuristic scanner ─────────────────────────────────────────────── */

interface PyBlock {
  indent: number;
  name: string;
  kind: "class" | "function";
}

function _extractPython(lines: string[]): Extraction {
  const symbols: ExtractedSymbol[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];
  const stack: PyBlock[] = [];

  const classOf = (): string => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.kind === "class") return stack[i]!.name;
    return "";
  };
  const functionOf = (): string => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.kind === "function") return stack[i]!.name;
    return "";
  };

  /** `node.end_lineno`: last line still inside the indented block. */
  const blockEnd = (startIdx: number, indent: number): number => {
    let end = startIdx;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const raw = lines[i]!;
      const stripped = raw.trim();
      if (!stripped || stripped.startsWith("#")) continue;
      if (_indentWidth(raw) <= indent) break;
      end = i;
    }
    return end + 1;
  };

  /** `ast.get_docstring(node)`, approximated (first statement string literal). */
  const docstringOf = (startIdx: number, indent: number): string => {
    for (let i = startIdx + 1; i < lines.length; i++) {
      const raw = lines[i]!;
      const stripped = raw.trim();
      if (!stripped) continue;
      if (stripped.startsWith("#")) continue;
      if (_indentWidth(raw) <= indent) return "";
      const m = /^(?:[rRbBfFuU]{0,2})("""|'''|"|')/.exec(stripped);
      if (!m) return "";
      const delim = m[1]!;
      let body = stripped.slice(m[0].length);
      if (!body.endsWith(delim) || body.length === 0) {
        const collected: string[] = [body];
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j]!;
          const close = l.indexOf(delim);
          if (close >= 0) {
            collected.push(l.slice(0, close));
            break;
          }
          collected.push(l);
        }
        body = collected.join("\n");
      } else {
        body = body.slice(0, body.length - delim.length);
      }
      // `inspect.cleandoc`: drop the first line's indent, de-indent the rest.
      const parts = body.replace(/\\n/g, "\n").split("\n");
      const first = (parts.shift() ?? "").trim();
      const rest = parts.map((l) => l.replace(/^\s+/, ""));
      return [first, ...rest].join("\n").trim().slice(0, 300);
    }
    return "";
  };

  // Remove string literals then comments, so call scanning never sees text.
  const codeOnly = (line: string): string =>
    line
      .replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, "")
      .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""')
      .split("#")[0]!;

  const callRe = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/g;
  const kwRe = /^(?:if|for|while|with|return|elif|except|lambda|assert|del|yield|await|not|and|or|in|is|print)\b/;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    const indent = _indentWidth(raw);
    while (stack.length > 0 && indent <= stack[stack.length - 1]!.indent) stack.pop();

    const line = i + 1;

    // ── class ─────────────────────────────────────────────────────────────
    const cm = /^class\s+([A-Za-z_]\w*)\s*[:(]/.exec(stripped);
    if (cm) {
      const name = cm[1]!;
      symbols.push({
        name,
        kind: "class",
        line,
        line_end: blockEnd(i, indent),
        parent: classOf(),
        signature: stripped,
        docstring: docstringOf(i, indent),
      });
      stack.push({ indent, name, kind: "class" });
      continue;
    }

    // ── def / async def ───────────────────────────────────────────────────
    const dm = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(stripped);
    if (dm) {
      const name = dm[1]!;
      const parent = classOf();
      symbols.push({
        name,
        kind: parent ? "method" : "function",
        line,
        line_end: blockEnd(i, indent),
        parent,
        signature: stripped,
        docstring: docstringOf(i, indent),
      });
      stack.push({ indent, name, kind: "function" });
      continue;
    }

    // ── import / from ... import ──────────────────────────────────────────
    const im = /^import\s+(.+)$/.exec(stripped);
    if (im) {
      for (const part of im[1]!.split(",")) {
        const p = part.trim();
        if (!p) continue;
        const asM = /^([\w.]+)\s+as\s+([A-Za-z_]\w*)$/.exec(p);
        imports.push({
          module: asM ? asM[1]! : p,
          names: [],
          alias: asM ? asM[2]! : "",
          line,
          is_from: false,
        });
      }
      continue;
    }
    const fm = /^from\s+([.\w]*)\s+import\s+(.+)$/.exec(stripped);
    if (fm) {
      // Python's visitor ignores relative imports with no module name.
      const mod = fm[1]!.replace(/^\.+/, "");
      let clause = fm[2]!.trim();
      if (clause.startsWith("(") && !clause.includes(")")) {
        for (let j = i + 1; j < lines.length; j++) {
          clause += " " + lines[j]!.trim();
          if (clause.includes(")")) break;
        }
      }
      clause = clause.replace(/[()]/g, " ").trim();
      if (mod) {
        const names = clause
          .split(",")
          .map((s) => s.trim().replace(/\s+as\s+[A-Za-z_]\w*$/, "").trim())
          .filter(Boolean);
        imports.push({ module: mod, names, alias: "", line, is_from: true });
      }
      continue;
    }

    // Calls + module/class level assignments, from the same code view.
    const code = codeOnly(raw);

    // ── variable assignment (visit_Assign at non-function scope) ─────────
    if (!functionOf() && !kwRe.test(stripped)) {
      let rest = code;
      const names: string[] = [];
      for (;;) {
        const vm = /^\s*([A-Za-z_]\w*)\s*=(?!=)\s*/.exec(rest);
        if (!vm) break;
        names.push(vm[1]!);
        rest = rest.slice(vm[0].length);
      }
      for (const name of names) {
        symbols.push({
          name,
          kind: "variable",
          line,
          line_end: line,
          parent: classOf(),
          signature: "",
          docstring: "",
        });
      }
    }

    // ── call sites ────────────────────────────────────────────────────────
    const caller = functionOf();
    callRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(code)) !== null) {
      const chain = m[1]!;
      const head = chain.split(".")[0]!;
      if (NOT_CALLS.has(chain) || NOT_CALLS.has(head)) continue;
      const openIdx = m.index + m[0]!.length - 1;
      calls.push({
        caller,
        callee: chain,
        line,
        args_count: _countArgs(_argTextAfter(code, openIdx)),
      });
    }
  }

  return { symbols, imports, calls };
}

/* ── JavaScript / TypeScript heuristic scanner ────────────────────────────── */

interface JsLine {
  raw: string;
  code: string;
  /** Net `{` minus `}` on this line, comments/strings removed. */
  braceDelta: number;
}

/**
 * Strip block comments, line comments and string/template literals while
 * tracking multi-line state, so brace counting and call detection see code only.
 * String bodies are replaced by `""` (not deleted) to keep the code balanced.
 */
function _jsCleanLines(lines: string[]): JsLine[] {
  const out: JsLine[] = [];
  let inBlockComment = false;
  let inTemplate = false;

  for (const raw of lines) {
    let code = "";
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i]!;
      const next = raw[i + 1];
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 2;
        } else i++;
        continue;
      }
      if (inTemplate) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "`") {
          inTemplate = false;
          code += '""';
          i++;
          continue;
        }
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === "/" && next === "/") break; // line comment
      if (ch === "`") {
        inTemplate = true;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < raw.length) {
          if (raw[i] === "\\") {
            i += 2;
            continue;
          }
          if (raw[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        code += '""';
        continue;
      }
      code += ch;
      i++;
    }

    let braceDelta = 0;
    for (const c of code) {
      if (c === "{") braceDelta++;
      else if (c === "}") braceDelta--;
    }
    out.push({ raw, code, braceDelta });
  }
  return out;
}

interface JsBlock {
  name: string;
  kind: "class" | "function";
  /** Brace depth at which this block's body lives. */
  depth: number;
}

function _extractJs(lines: string[]): Extraction {
  const cleaned = _jsCleanLines(lines);
  const symbols: ExtractedSymbol[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];
  const stack: JsBlock[] = [];

  const classOf = (): string => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.kind === "class") return stack[i]!.name;
    return "";
  };
  const functionOf = (): string => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.kind === "function") return stack[i]!.name;
    return "";
  };

  // Pass 1: brace depth per line (depth *before* the line's own braces).
  const depthBefore: number[] = [];
  let depth = 0;
  for (const l of cleaned) {
    depthBefore.push(depth);
    depth += l.braceDelta;
  }

  /**
   * End line (1-based) of the brace-delimited block that starts on line
   * `startIdx` (0-based), given the depth in effect before that line.
   * A declaration whose net brace delta never goes positive (e.g.
   * `type X = string;`) ends on its own line.
   */
  const braceEnd = (startIdx: number, baseDepth: number): number => {
    let d = baseDepth;
    for (let i = startIdx; i < cleaned.length; i++) {
      d += cleaned[i]!.braceDelta;
      if (d <= baseDepth) return i + 1;
    }
    return cleaned.length;
  };

  const callRe = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;

  for (let i = 0; i < cleaned.length; i++) {
    const { raw, code } = cleaned[i]!;
    const stripped = raw.trim();
    const decl = code.trim();
    if (!decl) continue;
    const depthHere = depthBefore[i]!;

    // Close finished blocks.
    while (stack.length > 0 && depthHere <= stack[stack.length - 1]!.depth) stack.pop();

    const line = i + 1;

    // ── class / interface / type / enum ───────────────────────────────────
    const cm =
      /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(decl) ??
      /^(?:export\s+)?(?:declare\s+)?(?:interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(decl) ??
      /^(?:export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/.exec(decl);
    if (cm) {
      const name = cm[1]!;
      symbols.push({
        name,
        kind: "class",
        line,
        line_end: braceEnd(i, depthHere),
        parent: classOf(),
        signature: stripped,
        docstring: "",
      });
      if (decl.includes("{")) stack.push({ name, kind: "class", depth: depthHere });
      continue;
    }

    // ── function declarations ─────────────────────────────────────────────
    const fnm = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(decl);
    if (fnm) {
      const name = fnm[1]!;
      const inClass = classOf() !== "";
      symbols.push({
        name,
        kind: inClass ? "method" : "function",
        line,
        line_end: braceEnd(i, depthHere),
        parent: classOf(),
        signature: stripped,
        docstring: "",
      });
      stack.push({ name, kind: "function", depth: depthHere });
      continue;
    }

    // ── methods inside a class body ───────────────────────────────────────
    if (classOf() && depthHere === classBodyDepth(stack)) {
      const mm =
        /^(?:(?:public|private|protected|static|async|readonly|override|abstract|declare|get|set)\s+)*([A-Za-z_$#][\w$]*)\s*(?:<[^>]*>)?\s*\(/.exec(
          decl,
        ) ??
        // `name = (a) => ...` class property arrow functions
        /^(?:(?:public|private|protected|static|readonly|override|declare)\s+)*([A-Za-z_$#][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/.exec(
          decl,
        );
      if (mm && !NOT_CALLS.has(mm[1]!)) {
        const name = mm[1]!;
        symbols.push({
          name,
          kind: "method",
          line,
          line_end: braceEnd(i, depthHere),
          parent: classOf(),
          signature: stripped,
          docstring: "",
        });
        stack.push({ name, kind: "function", depth: depthHere });
        continue;
      }
    }

    // ── arrow / function expressions and variables ────────────────────────
    const vm =
      /^(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*/.exec(
        decl,
      );
    if (vm) {
      const name = vm[1]!;
      const after = decl.slice(vm[0].length);
      const isFunction =
        after.startsWith("function") ||
        after.startsWith("async function") ||
        /^(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/.test(after) ||
        /^[A-Za-z_$][\w$]*\s*=>/.test(after) ||
        /^(?:async\s*)?<[^>]*>\s*\(/.test(after);
      if (!functionOf()) {
        if (isFunction) {
          symbols.push({
            name,
            kind: classOf() ? "method" : "function",
            line,
            line_end: braceEnd(i, depthHere),
            parent: classOf(),
            signature: stripped,
            docstring: "",
          });
          if (decl.includes("{")) stack.push({ name, kind: "function", depth: depthHere });
          continue;
        }
        symbols.push({
          name,
          kind: "variable",
          line,
          line_end: line,
          parent: classOf(),
          signature: "",
          docstring: "",
        });
      }
    }

    // ── imports / requires ────────────────────────────────────────────────
    const fromM = /^(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/.exec(stripped);
    if (fromM) {
      const clause = fromM[1]!.trim().replace(/[{}]/g, " ");
      const names = clause
        .split(",")
        .map((s) => s.trim().replace(/^\*\s*as\s+/, "").replace(/\s+as\s+.*$/, "").trim())
        .filter(Boolean);
      imports.push({ module: fromM[2]!, names, alias: "", line, is_from: true });
      continue;
    }
    const bareM = /^import\s+['"]([^'"]+)['"]/.exec(stripped);
    if (bareM) {
      imports.push({ module: bareM[1]!, names: [], alias: "", line, is_from: false });
      continue;
    }
    for (const rm of stripped.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      imports.push({ module: rm[1]!, names: [], alias: "", line, is_from: false });
    }

    // ── call sites ────────────────────────────────────────────────────────
    const caller = functionOf();
    callRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(code)) !== null) {
      const chain = m[1]!;
      const head = chain.split(".")[0]!;
      if (NOT_CALLS.has(chain) || NOT_CALLS.has(head)) continue;
      const openIdx = m.index + m[0]!.length - 1;
      calls.push({
        caller,
        callee: chain,
        line,
        args_count: _countArgs(_argTextAfter(code, openIdx)),
      });
    }
  }

  return { symbols, imports, calls };
}

/**
 * Brace depth at which the innermost enclosing class body's members live.
 * A block pushed at declaration depth `d` has its body at `d + 1`.
 */
function classBodyDepth(stack: JsBlock[]): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.kind === "class") return stack[i]!.depth + 1;
  }
  return -1;
}

/* ── ASTIndexer ───────────────────────────────────────────────────────────── */

/**
 * Builds and queries a real AST index of a workspace.
 *
 * The key capability:
 *     "Before you edit function X, here's everything that calls it,
 *      everything it imports, and what will break."
 */
export class ASTIndexer {
  workspace: string;
  private readonly _conn: DatabaseSync;
  /** Python kept a `_index_thread`; Node keeps the in-flight background promise. */
  _index_task: Promise<void> | null = null;

  constructor(workspace: string) {
    this.workspace = path.resolve(workspace);
    const ws_hash = createHash("md5").update(this.workspace).digest("hex").slice(0, 8);
    const db_path = path.join(AST_INDEX_DIR, `ast_${ws_hash}.db`);
    this._conn = new DatabaseSync(db_path, { timeout: 10000 });
    this._init_schema();
  }

  _init_schema(): void {
    this._conn.exec(_SCHEMA);
  }

  /* ── Indexing ────────────────────────────────────────────────────────────── */

  /**
   * Index all source files in the workspace. Only re-indexes changed files.
   * Returns stats dict.
   *
   * Synchronous on purpose: it is driven by the `ast_reindex` tool, which
   * returns a string. Use `index_workspace_async()` for background indexing.
   */
  index_workspace(max_files = 500, force = false): IndexStats {
    const files = this._find_source_files(max_files);
    let new_count = 0;
    let changed_count = 0;
    let skipped_count = 0;

    for (const fpath of files) {
      try {
        const mtime = fs.statSync(fpath).mtimeMs / 1000;
        const row = this._conn.prepare("SELECT mtime FROM files WHERE path=?").get(fpath) as
          | Record<string, SQLInputValue>
          | undefined;
        if (row && Number(row["mtime"]) === mtime && !force) {
          skipped_count += 1;
          continue;
        }
        this._index_file(fpath, mtime);
        if (row) {
          changed_count += 1;
        } else {
          new_count += 1;
        }
      } catch (e) {
        debug(`[AST] Failed to index ${fpath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      files_indexed: new_count + changed_count,
      files_new: new_count,
      files_changed: changed_count,
      files_skipped: skipped_count,
      total: files.length,
    };
  }

  /** camelCase alias. */
  indexWorkspace(max_files = 500, force = false): IndexStats {
    return this.index_workspace(max_files, force);
  }

  /**
   * Background indexing — doesn't block the agent.
   * Bounded-concurrency batches with an event-loop yield between them, which is
   * the async analogue of Python's `threading.Thread(target=..., daemon=True)`.
   */
  index_workspace_async(): void {
    if (this._index_task) return;
    this._index_task = this._index_workspace_pooled()
      .then(() => undefined)
      .catch((e: unknown) => {
        warn(`[AST] Background indexing failed: ${e instanceof Error ? e.message : String(e)}`);
      })
      .finally(() => {
        this._index_task = null;
      });
  }

  /** camelCase alias. */
  indexWorkspaceAsyncStart(): void {
    this.index_workspace_async();
  }

  /** Awaitable form of the background indexer. */
  async indexWorkspaceAsync(max_files = 500, force = false): Promise<IndexStats> {
    return this._index_workspace_pooled(max_files, force);
  }

  private async _index_workspace_pooled(max_files = 500, force = false): Promise<IndexStats> {
    const files = this._find_source_files(max_files);
    let new_count = 0;
    let changed_count = 0;
    let skipped_count = 0;
    const concurrency = 8;
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (fpath): Promise<"new" | "changed" | "skipped" | "failed"> => {
          try {
            const mtime = fs.statSync(fpath).mtimeMs / 1000;
            const row = this._conn.prepare("SELECT mtime FROM files WHERE path=?").get(fpath) as
              | Record<string, SQLInputValue>
              | undefined;
            if (row && Number(row["mtime"]) === mtime && !force) return "skipped";
            this._index_file(fpath, mtime);
            return row ? "changed" : "new";
          } catch (e) {
            debug(`[AST] Failed to index ${fpath}: ${e instanceof Error ? e.message : String(e)}`);
            return "failed";
          }
        }),
      );
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        if (r.value === "new") new_count += 1;
        else if (r.value === "changed") changed_count += 1;
        else if (r.value === "skipped") skipped_count += 1;
      }
      // Yield so the agent's event loop is never starved by a large workspace.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return {
      files_indexed: new_count + changed_count,
      files_new: new_count,
      files_changed: changed_count,
      files_skipped: skipped_count,
      total: files.length,
    };
  }

  /** Python's `.py`-only discovery, kept for API compatibility. */
  _find_python_files(max_files: number): string[] {
    return this._find_files(max_files, new Set([".py"]));
  }

  /** All indexable source files (Python behaviour → .py; port adds TS/JS). */
  _find_source_files(max_files: number): string[] {
    return this._find_files(max_files, new Set(Object.keys(INDEX_EXTENSIONS)));
  }

  private _find_files(max_files: number, exts: Set<string>): string[] {
    const files: string[] = [];
    const walk = (dir: string): boolean => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return false;
      }
      const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name));
      for (const fn of entries) {
        if (fn.isDirectory()) continue;
        if (exts.has(path.extname(fn.name).toLowerCase())) {
          files.push(path.join(dir, fn.name));
          if (files.length >= max_files) return true;
        }
      }
      for (const d of dirs) {
        if (walk(path.join(dir, d.name))) return true;
      }
      return false;
    };
    walk(this.workspace);
    return files;
  }

  /** Parse one source file and update all tables. */
  _index_file(fpath: string, mtime: number): void {
    let source: string;
    try {
      source = fs.readFileSync(fpath, "utf-8");
    } catch {
      return;
    }

    const language = INDEX_EXTENSIONS[path.extname(fpath).toLowerCase()] ?? "python";
    const lines = source.split(/\r?\n/);
    const extraction = language === "python" ? _extractPython(lines) : _extractJs(lines);

    const file_hash = createHash("md5").update(source, "utf-8").digest("hex");

    // Clear old data for this file
    for (const tbl of ["symbols", "imports", "calls", "symbol_refs"]) {
      this._conn.prepare(`DELETE FROM ${tbl} WHERE file_path=?`).run(fpath);
    }

    const symStmt = this._conn.prepare(
      "INSERT INTO symbols(file_path,name,kind,line_start,line_end,parent,signature,docstring,is_public)" +
        " VALUES(?,?,?,?,?,?,?,?,?)",
    );
    for (const sym of extraction.symbols) {
      symStmt.run(
        fpath,
        sym.name,
        sym.kind,
        sym.line,
        sym.line_end,
        sym.parent,
        sym.signature,
        (sym.docstring ?? "").slice(0, 300),
        sym.name.startsWith("_") ? 0 : 1,
      );
    }

    const impStmt = this._conn.prepare(
      "INSERT INTO imports(file_path,module,names,alias,line,is_from) VALUES(?,?,?,?,?,?)",
    );
    for (const imp of extraction.imports) {
      impStmt.run(
        fpath,
        imp.module,
        JSON.stringify(imp.names ?? []),
        imp.alias ?? "",
        imp.line,
        imp.is_from ? 1 : 0,
      );
    }

    const callStmt = this._conn.prepare(
      "INSERT INTO calls(file_path,caller,callee,line,args_count) VALUES(?,?,?,?,?)",
    );
    for (const call of extraction.calls) {
      callStmt.run(fpath, call.caller ?? "", call.callee, call.line, call.args_count ?? 0);
    }

    this._conn
      .prepare(
        "INSERT OR REPLACE INTO files(path,mtime,size,hash,language,indexed_at) VALUES(?,?,?,?,?,?)",
      )
      .run(fpath, mtime, source.length, file_hash, language, Date.now() / 1000);
  }

  /* ── Queries ─────────────────────────────────────────────────────────────── */

  /** Find where a class/function/variable is defined. */
  find_symbol(name: string, kind: string | null = null): Symbol[] {
    let q = "SELECT * FROM symbols WHERE name LIKE ?";
    const params: SQLInputValue[] = [`%${name}%`];
    if (kind) {
      q += " AND kind=?";
      params.push(kind);
    }
    q += " ORDER BY is_public DESC, name LIMIT 20";
    const rows = this._conn.prepare(q).all(...params);
    return rows.map(
      (r) =>
        new Symbol({
          name: String(r["name"]),
          kind: String(r["kind"]),
          file_path: String(r["file_path"]),
          line: Number(r["line_start"]),
          signature: r["signature"] ? String(r["signature"]) : "",
          docstring: r["docstring"] ? String(r["docstring"]) : "",
          parent: r["parent"] ? String(r["parent"]) : "",
        }),
    );
  }

  /** Find all places that call a function — "who calls X?" */
  find_callers(function_name: string): CallSite[] {
    const rows = this._conn
      .prepare("SELECT * FROM calls WHERE callee LIKE ? ORDER BY file_path, line")
      .all(`%${function_name}%`);
    return rows.map(
      (r) =>
        new CallSite({
          file_path: String(r["file_path"]),
          caller: r["caller"] ? String(r["caller"]) : "",
          callee: String(r["callee"]),
          line: Number(r["line"]),
        }),
    );
  }

  /** Where is a symbol used? Combines calls + imports. */
  find_usages(symbol_name: string): Array<Record<string, unknown>> {
    const calls = this.find_callers(symbol_name);
    const imp_rows = this._conn
      .prepare("SELECT file_path, line FROM imports WHERE names LIKE ? OR module LIKE ?")
      .all(`%${symbol_name}%`, `%${symbol_name}%`);
    const usages: Array<Record<string, unknown>> = calls.map((c) => ({
      type: "call",
      file: c.file_path,
      line: c.line,
      caller: c.caller,
      via: c.callee,
    }));
    usages.push(
      ...imp_rows.map((r) => ({
        type: "import",
        file: String(r["file_path"]),
        line: Number(r["line"]),
      })),
    );
    return usages;
  }

  /** Which files import a given module? */
  what_imports(module_name: string): string[] {
    const rows = this._conn
      .prepare("SELECT DISTINCT file_path FROM imports WHERE module LIKE ?")
      .all(`%${module_name}%`);
    return rows.map((r) => String(r["file_path"]));
  }

  /**
   * Before editing symbol_name, what will break?
   * Returns an ImpactAnalysis with call sites, affected files, risk level.
   */
  impact_analysis(symbol_name: string): ImpactAnalysis {
    const callers = this.find_callers(symbol_name);
    const affected = [...new Set(callers.map((c) => c.file_path).filter((f) => f !== ""))];

    // Risk scoring
    const n_callers = callers.length;
    const n_files = affected.length;

    let risk: string;
    if (n_callers === 0 && n_files === 0) {
      risk = "low";
    } else if (n_callers < 3) {
      risk = "low";
    } else if (n_callers < 8 || n_files < 3) {
      risk = "medium";
    } else if (n_callers < 20) {
      risk = "high";
    } else {
      risk = "critical";
    }

    const parts: string[] = [];
    if (callers.length > 0) {
      parts.push(`Called ${n_callers}x across ${n_files} file(s)`);
    }
    if (callers.length === 0) {
      parts.push("Not called anywhere — safe to edit");
    }

    const summary = `Impact of changing '${symbol_name}': ${parts.join(", ") || "minimal"}`;

    return new ImpactAnalysis({
      symbol: symbol_name,
      direct_calls: callers,
      affected_files: affected,
      risk_level: risk,
      summary,
    });
  }

  /** camelCase alias. */
  impactAnalysis(symbol_name: string): ImpactAnalysis {
    return this.impact_analysis(symbol_name);
  }

  /**
   * Before editing a file, get full context:
   * what's defined, what's imported, what calls what.
   */
  get_file_context(file_path: string): string {
    const abs_path = path.isAbsolute(file_path) ? file_path : path.join(this.workspace, file_path);
    const syms = this._conn
      .prepare(
        "SELECT name, kind, line_start, signature FROM symbols WHERE file_path=? ORDER BY line_start",
      )
      .all(abs_path);
    const imps = this._conn
      .prepare("SELECT module, names FROM imports WHERE file_path=? ORDER BY line")
      .all(abs_path);

    const lines = [`[AST Context: ${path.relative(this.workspace, abs_path)}]`];

    if (imps.length > 0) {
      lines.push("Imports:");
      for (const r of imps.slice(0, 10)) {
        let names: string[] = [];
        try {
          const parsed: unknown = JSON.parse(String(r["names"] ?? "[]"));
          if (Array.isArray(parsed)) names = parsed.map((x) => String(x));
        } catch {
          names = [];
        }
        if (names.length > 0) {
          lines.push(`  from ${String(r["module"])} import ${names.slice(0, 4).join(", ")}`);
        } else {
          lines.push(`  import ${String(r["module"])}`);
        }
      }
    }

    if (syms.length > 0) {
      lines.push("Symbols:");
      for (const r of syms.slice(0, 20)) {
        const indent = String(r["kind"]) === "method" ? "  " : "";
        lines.push(`  ${indent}${String(r["kind"])} ${String(r["name"])}  (line ${Number(r["line_start"])})`);
      }
    }

    return lines.join("\n");
  }

  /** camelCase alias. */
  getFileContext(file_path: string): string {
    return this.get_file_context(file_path);
  }

  /** Index statistics. */
  stats(): AstStats {
    const n_files = this._conn.prepare("SELECT COUNT(*) FROM files").get();
    const n_symbols = this._conn.prepare("SELECT COUNT(*) FROM symbols").get();
    const n_calls = this._conn.prepare("SELECT COUNT(*) FROM calls").get();
    const n_imports = this._conn.prepare("SELECT COUNT(*) FROM imports").get();
    const kindRows = this._conn
      .prepare("SELECT kind, COUNT(*) as cnt FROM symbols GROUP BY kind")
      .all();
    const kinds: Record<string, number> = {};
    for (const r of kindRows) kinds[String(r["kind"])] = Number(r["cnt"]);

    return {
      files_indexed: _firstValue(n_files),
      symbols: _firstValue(n_symbols),
      calls: _firstValue(n_calls),
      imports: _firstValue(n_imports),
      by_kind: kinds,
    };
  }

  /** Format impact analysis as a readable string for the agent. */
  format_impact(ia: ImpactAnalysis, max_callers = 10): string {
    const lines = [
      `Impact Analysis: '${ia.symbol}'`,
      `  Risk level: ${ia.risk_level.toUpperCase()}`,
      `  ${ia.summary}`,
    ];
    if (ia.direct_calls.length > 0) {
      lines.push(`  Callers (${ia.direct_calls.length} total):`);
      for (const c of ia.direct_calls.slice(0, max_callers)) {
        const rel = path.relative(this.workspace, c.file_path);
        lines.push(`    ${rel}:${c.line}  ${c.caller || "?"} → ${c.callee}`);
      }
      if (ia.direct_calls.length > max_callers) {
        lines.push(`    ... and ${ia.direct_calls.length - max_callers} more`);
      }
    }
    if (ia.direct_calls.length === 0) {
      lines.push("  No callers found — safe to modify");
    }
    return lines.join("\n");
  }

  /** camelCase alias. */
  formatImpact(ia: ImpactAnalysis, max_callers = 10): string {
    return this.format_impact(ia, max_callers);
  }

  /**
   * One-line summary for swarm orchestrator context injection.
   *
   * Byte-identical to Python on a Python-only workspace. When the index also
   * covers TypeScript/JavaScript (the port indexes those extensions) the
   * language word becomes "code" rather than claiming everything is Python.
   */
  summary(): string {
    const s = this.stats();
    if (s.files_indexed === 0) {
      return "";
    }
    const langs = new Set(
      this._conn
        .prepare("SELECT DISTINCT language FROM files")
        .all()
        .map((r) => String(r["language"] ?? "python")),
    );
    const langLabel = langs.size === 1 && langs.has("python") ? "Python" : "code";
    return (
      `${s.files_indexed} ${langLabel} files | ` +
      `${s.symbols ?? 0} symbols | ` +
      `${s.calls ?? 0} call sites`
    );
  }

  /** Inject AST tools into agent._tool_map. */
  as_tool_map(): Record<string, (...args: unknown[]) => string> {
    return {
      ast_find_symbol: _tool(["name", "kind"], (a) =>
        this._t_find_symbol(
          String(a["name"] ?? ""),
          a["kind"] === undefined || a["kind"] === null ? null : String(a["kind"]),
        ),
      ),
      ast_find_callers: _tool(["function_name"], (a) =>
        this._t_find_callers(String(a["function_name"] ?? "")),
      ),
      ast_impact: _tool(["symbol_name"], (a) => this._t_impact(String(a["symbol_name"] ?? ""))),
      ast_file_context: _tool(["path"], (a) => this._t_file_context(String(a["path"] ?? ""))),
      ast_stats: _tool([], () => this._t_stats()),
      ast_reindex: _tool(["force"], (a) => this._t_reindex(Boolean(a["force"]))),
    };
  }

  /** camelCase alias. */
  asToolMap(): Record<string, (...args: unknown[]) => string> {
    return this.as_tool_map();
  }

  /* ── Tool implementations ────────────────────────────────────────────────── */

  _t_find_symbol(name: string, kind: string | null = null): string {
    const syms = this.find_symbol(name, kind);
    if (syms.length === 0) {
      return `Symbol '${name}' not found in index.`;
    }
    const lines = [`Found ${syms.length} match(es) for '${name}':`];
    for (const s of syms) {
      const rel = path.relative(this.workspace, s.file_path);
      const parent = s.parent ? ` (in ${s.parent})` : "";
      lines.push(`  ${s.kind} ${s.name}${parent} — ${rel}:${s.line}`);
      if (s.signature) {
        lines.push(`    ${s.signature.slice(0, 100)}`);
      }
    }
    return lines.join("\n");
  }

  _t_find_callers(function_name: string): string {
    const callers = this.find_callers(function_name);
    if (callers.length === 0) {
      return `No callers found for '${function_name}'.`;
    }
    const lines = [`'${function_name}' is called ${callers.length}x:`];
    for (const c of callers.slice(0, 15)) {
      const rel = path.relative(this.workspace, c.file_path);
      lines.push(`  ${rel}:${c.line}  (in ${c.caller || "module level"})`);
    }
    return lines.join("\n");
  }

  _t_impact(symbol_name: string): string {
    const ia = this.impact_analysis(symbol_name);
    return this.format_impact(ia);
  }

  _t_file_context(p: string): string {
    return this.get_file_context(p);
  }

  _t_stats(): string {
    const s = this.stats();
    return (
      `AST Index: ${s.files_indexed} files | ` +
      `${s.symbols} symbols | ${s.calls} calls | ` +
      `${s.imports} imports\n` +
      `By kind: ` +
      Object.entries(s.by_kind)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    );
  }

  _t_reindex(force = false): string {
    const stats = this.index_workspace(500, force);
    return (
      `Re-indexed: ${stats.files_indexed} files ` +
      `(${stats.files_new} new, ${stats.files_changed} changed, ` +
      `${stats.files_skipped} unchanged)`
    );
  }

  /** Close the underlying handle. */
  close(): void {
    try {
      this._conn.close();
    } catch {
      /* already closed */
    }
  }
}

/** `SELECT COUNT(*)` returns one unnamed column; read it positionally. */
function _firstValue(row: Record<string, SQLInputValue> | undefined): number {
  if (!row) return 0;
  const values = Object.values(row);
  return values.length > 0 ? Number(values[0]) : 0;
}

/**
 * Tool-map adapter. Python tools took keyword arguments (`f(**args)`) and the
 * Node tool ports take either a single args object or positional parameters, so
 * the returned handler accepts both call styles.
 */
function _tool(
  paramNames: string[],
  impl: (args: Record<string, unknown>) => string,
): (...args: unknown[]) => string {
  return (...received: unknown[]): string => {
    if (received.length === 1) {
      const only = received[0];
      if (only !== null && typeof only === "object" && !Array.isArray(only)) {
        return impl(only as Record<string, unknown>);
      }
    }
    const args: Record<string, unknown> = {};
    paramNames.forEach((n, i) => {
      if (received[i] !== undefined) args[n] = received[i];
    });
    return impl(args);
  };
}

/** Exported for tests/debugging: the raw heuristic extractor. */
export function _extract_symbols(source: string, language = "python"): Extraction {
  const lines = source.split(/\r?\n/);
  return language === "python" ? _extractPython(lines) : _extractJs(lines);
}
