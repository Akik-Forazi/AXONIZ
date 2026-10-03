/**
 * TEMPORARY smoke test for the ported src/tools modules.
 * Not part of the deliverable; deleted after verification.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { expandGlob, globToRegExp, unifiedDiff } from "./_internal.js";
import { CodeTools } from "./code_tools.js";
import { ComputerTools } from "./computer_tools.js";
import { FileTools } from "./file_tools.js";
import { ShellTools } from "./shell_tools.js";
import { WebTools } from "./web_tools.js";

const ARROW = "\u2192";
const BOX_H = "\u2500\u2500";
const BAR = "\u2502";
const ELL = "\u2026";
const EM = "\u2014";
let failures = 0;

function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    failures++;
    console.log(`FAIL ${name}`);
    if (extra !== undefined) console.log(`    ${JSON.stringify(extra)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axo-tools-"));
const ft = new FileTools(tmp);

/* ── FileTools: write / read ───────────────────────────────────────────── */
const w1 = ft.write("sub/a.txt", "alpha\nbeta\ngamma\ndelta\n");
check("write: 5 lines / 23 chars", w1.includes("(5 lines, 23 chars)"), w1);
check("write: absolute path", w1.includes(path.join(tmp, "sub", "a.txt")), w1);

const r1 = ft.read("sub/a.txt");
check(
  "read: numbered, one newline per line",
  r1 === `${BOX_H} sub/a.txt (4 total) ${BOX_H}\n   1 ${BAR} alpha\n   2 ${BAR} beta\n   3 ${BAR} gamma\n   4 ${BAR} delta\n`,
  r1,
);

fs.writeFileSync(path.join(tmp, "sub", "noeol.txt"), "x\ny");
const r2 = ft.read("sub/noeol.txt");
check("read: no trailing NL still terminated", r2.endsWith(`   2 ${BAR} y\n`), r2);

const r3 = ft.read("sub/a.txt", 2, 3);
check("read: range label", r3.startsWith(`${BOX_H} sub/a.txt lines 2-3 (4 total) ${BOX_H}\n`), r3);
check("read: range body", r3.endsWith(`   2 ${BAR} beta\n   3 ${BAR} gamma\n`), r3);
check("read: range excludes line 4", !r3.includes("delta"), r3);
check("read: missing file", ft.read("missing.txt").startsWith("[ERROR] Not found: "));

/* ── FileTools: edit ───────────────────────────────────────────────────── */
const e1 = ft.edit("sub/a.txt", "beta", "BETA");
// Byte-identical to Python difflib with n=2, lineterm="" (verified against CPython).
check(
  "edit: diff identical to Python difflib",
  e1 ===
    `[OK] Edited sub/a.txt (1 replacement(s))\n--- a/sub/a.txt\n+++ b/sub/a.txt\n@@ -1,4 +1,4 @@\n alpha\n-beta\n+BETA\n gamma\n delta`,
  e1,
);
check("edit: backup holds original", fs.readFileSync(path.join(tmp, "sub", "a.txt.bak"), "utf8") === "alpha\nbeta\ngamma\ndelta\n");
check("edit: file updated", fs.readFileSync(path.join(tmp, "sub", "a.txt"), "utf8") === "alpha\nBETA\ngamma\ndelta\n");

const e2 = ft.edit("sub/a.txt", "nope-zzz", "x");
check("edit: not-found prefix", e2.startsWith("[ERROR] Text not found in sub/a.txt\n"), e2);
check("edit: not-found echoes search text", e2.endsWith("Searched for:\nnope-zzz"), e2);
check("edit: missing file", ft.edit("missing.txt", "a", "b").startsWith("[ERROR] File not found: "));

/* ── FileTools: patch (Python-faithful quirks) ─────────────────────────── */
ft.write("patchme.txt", "one\ntwo\nthree\nfour\nfive\n");
const p1 = ft.patch("patchme.txt", "@@ -2,2 +2,2 @@\n two\n-three\n+THREE\n four\n");
check("patch: success message", p1 === "[OK] Patch applied to patchme.txt", p1);
// Python parity: `body.splitlines()[1:]` drops the first body line, so "two" is
// skipped, and every written line gains a trailing newline.
check(
  "patch: matches Python splitlines()[1:] quirk",
  fs.readFileSync(path.join(tmp, "patchme.txt"), "utf8") === "one\nTHREE\nfour\nfive\n",
  fs.readFileSync(path.join(tmp, "patchme.txt"), "utf8"),
);
check("patch: missing file", ft.patch("missing.txt", "@@ -1,1 +1,1 @@\n-a\n+b\n").startsWith("[ERROR] Patch failed: "));

/* ── FileTools: search / grep ──────────────────────────────────────────── */
ft.write("g/a.py", "import os\nvalue = 1\n# needle here\n");
ft.write("g/b.py", "NEEDLE\n");
ft.write("g/skip.md", "needle\n");
ft.write("g/deep/c.py", "x = 'needle'\n");

const s1 = ft.search(".", "*.py");
check("search: header", s1.startsWith("Found 3 file(s) matching '*.py':"), s1);
check("search: relative path + size", s1.includes(`${path.join("g", "a.py")}  (34 B)`), s1);
check("search: no match", ft.search(".", "*.nomatch") === "No files matching '*.nomatch' in .");

const g1 = ft.grep(".", "needle", "*.py");
check("grep: header count", g1.startsWith(`grep 'needle' in *.py ${EM} 2 match(es):`), g1);
check("grep: relative:line:text", g1.includes(`  ${path.join("g", "a.py")}:3: # needle here`), g1);
check("grep: case-sensitive excludes NEEDLE", !g1.includes("b.py"), g1);
const g2 = ft.grep(".", "needle", "*.py", false);
check("grep: case-insensitive includes NEEDLE", g2.includes(`${path.join("g", "b.py")}:1: NEEDLE`), g2);
check("grep: no match", ft.grep(".", "zzz-nope", "*.py") === "No matches for 'zzz-nope' in *.py files under .");

/* ── FileTools: fs operations ──────────────────────────────────────────── */
const ld = ft.listDir(".");
check("listDir: header", ld.startsWith(`${BOX_H} ./ (2 dirs, 1 files) ${BOX_H}\n`), ld);
check("listDir: dirs first with trailing slash", ld.includes("  [DIR]  g/\n  [DIR]  sub/\n"), ld);
check("listDir: file row layout", /^ {2}\[FILE] patchme\.txt\s+\d+ B$/m.test(ld), ld);
check("listDir: hides noise", !ld.includes("node_modules") && !ld.includes("__pycache__"));
check("listDir: subdir header", ft.listDir("g").startsWith(`${BOX_H} g/ (1 dirs, 3 files) ${BOX_H}\n`), ft.listDir("g"));
check("listDir: missing dir", ft.listDir("nope-dir").startsWith("[ERROR] Cannot list "));

const cp = ft.copy("sub/a.txt", "sub/copy.txt");
check("copy: message", cp === `[OK] Copied sub/a.txt ${ARROW} sub/copy.txt`, cp);
check("copy: content", fs.readFileSync(path.join(tmp, "sub", "copy.txt"), "utf8") === "alpha\nBETA\ngamma\ndelta\n");
const mv = ft.move("sub/copy.txt", "sub/moved.txt");
check("move: message", mv === `[OK] Moved sub/copy.txt ${ARROW} sub/moved.txt`, mv);
check("move: destination exists, source gone", fs.existsSync(path.join(tmp, "sub", "moved.txt")) && !fs.existsSync(path.join(tmp, "sub", "copy.txt")));
check("makeDir: message", ft.makeDir("newdir") === "[OK] Created directory: newdir");
check("delete: directory", ft.delete("newdir") === "[OK] Deleted directory: newdir");
check("delete: file", ft.delete("sub/moved.txt") === "[OK] Deleted file: sub/moved.txt");
check("delete: missing", ft.delete("gone.txt").startsWith("[ERROR] Not found: "));

check("append: message", ft.append("patchme.txt", "six\n") === `[OK] Appended 4 chars to ${path.join(tmp, "patchme.txt")}`);

const fi = ft.fileInfo("sub/a.txt");
check("fileInfo: layout", fi.startsWith(`${BOX_H} sub/a.txt ${BOX_H}\n  size:     23 bytes\n  modified: `), fi);
check("fileInfo: file type", fi.endsWith("  type:     file"), fi);
check("fileInfo: dir type", ft.fileInfo("g").endsWith("  type:     directory"));
check("fileInfo: missing", ft.fileInfo("nope").startsWith("[ERROR] "));

const rm = ft.readMany(["sub/a.txt", "sub/noeol.txt"]);
check(
  "readMany: blank-line join",
  rm ===
    `${BOX_H} sub/a.txt (4 total) ${BOX_H}\n   1 ${BAR} alpha\n   2 ${BAR} BETA\n   3 ${BAR} gamma\n   4 ${BAR} delta\n` +
      `\n\n${BOX_H} sub/noeol.txt (2 total) ${BOX_H}\n   1 ${BAR} x\n   2 ${BAR} y\n`,
  rm,
);

/* ── _internal ─────────────────────────────────────────────────────────── */
check("globToRegExp: ** crosses dirs", globToRegExp("**/*.py").test("/a/b/c.py"));
check("globToRegExp: * stays in segment", !globToRegExp("*.py").test("a/b.py"));
check("globToRegExp: ?", globToRegExp("a?.py").test("ab.py") && !globToRegExp("a?.py").test("abc.py"));
check("expandGlob: recursive like python **", expandGlob(path.join(tmp, "g"), "*.py").length === 3);
check("expandGlob: literal name", expandGlob(tmp, "patchme.txt").length === 1);
check("expandGlob: skips dot dirs", !expandGlob(tmp, "*").some((x) => x.includes(".git")));

const ud = unifiedDiff(["a", "b", "c", "d", "e", "f", "g"], ["a", "b", "c", "D", "e", "f", "g"], { fromFile: "a/x", toFile: "b/x" });
check(
  "unifiedDiff: hunk + context",
  ud.join("\n") === "--- a/x\n+++ b/x\n@@ -1,7 +1,7 @@\n a\n b\n c\n-d\n+D\n e\n f\n g",
  ud.join("\n"),
);
check("unifiedDiff: unchanged -> headers only", unifiedDiff(["a"], ["a"], { fromFile: "a", toFile: "b" }).length === 2);
const before = Array.from({ length: 20 }, (_, i) => String(i + 1));
const ud3 = unifiedDiff(before, before.slice(0, 19).concat(["XX"]), { fromFile: "a", toFile: "b" });
check("unifiedDiff: tail hunk numbering", ud3.some((l) => l.startsWith("@@ -17,4 +17,4 @@")), ud3.filter((l) => l.startsWith("@@")));

/* ── ShellTools ────────────────────────────────────────────────────────── */
const st = new ShellTools(tmp);
check("shell: empty guard", (await st.run("   ")) === "[ERROR] Empty command");
check("shell: no-output frame", (await st.run("exit 0")) === "$ exit 0  [exit 0]\n(no output)");
check("shell: non-zero exit frame", (await st.run("exit 3")) === "$ exit 3  [exit 3]\n(no output)");
check(
  "shell: stdout only",
  (await st.run("node -e \"process.stdout.write('hi')\"")) === "$ node -e \"process.stdout.write('hi')\"  [exit 0]\nhi",
  await st.run("node -e \"process.stdout.write('hi')\""),
);
check("which: hit", st.which("node").startsWith(`[OK] node ${ARROW} `));
check("which: miss", st.which("definitely-not-real-xyz") === "[NOT FOUND] definitely-not-real-xyz not in PATH");
check("envInfo", st.envInfo().startsWith("Node v") && st.envInfo().includes(`CWD: ${tmp}`), st.envInfo());

const big = await st.run(`node -e "process.stdout.write('x'.repeat(9000))"`, 30);
check(
  "shell: truncation matches Python (post-slice length)",
  big.slice(0, 8000) === "x".repeat(8000) && big.endsWith(`\n${ELL} [truncated, 8000 total chars]`),
  [big.slice(-40), big.length],
);
check("shell: timeout", (await st.run("node -e \"setTimeout(()=>{},5000)\"", 1)).startsWith("[TIMEOUT] Command killed after 1s: "));
const py = await st.runPython("print('hello')");
check("runPython: runs or degrades with a clear string", py.startsWith("python (") || py.startsWith("[PYTHON ERROR]"), py);

/* ── CodeTools ─────────────────────────────────────────────────────────── */
const ct = new CodeTools(tmp);
const tree = ct.tree(".", 2);
check("tree: root line", tree.startsWith(`${tmp}/\n`), tree.slice(0, 60));
check("tree: box connectors", tree.includes("\u251c\u2500\u2500 ") && tree.includes("\u2514\u2500\u2500 "));
check("tree: depth respected", ct.tree(".", 1).split("\n").length < tree.split("\n").length);

fs.writeFileSync(path.join(tmp, "g", "d.py"), "class Thing:\n    pass\n\ndef func_one():\n    pass\n");
const an = ct.analyze("g");
check("analyze: header", an.startsWith(`Architectural Overview: ${path.join(tmp, "g")}`), an);
check("analyze: class + def extracted", an.includes(`\nSource File: ${path.join("g", "d.py")}\n  [CLASS] Thing\n  [DEF] func_one`), an);
check("analyze: no-python message", ct.analyze("does-not-exist").endsWith(" - No Python source files were found in this directory."));
check("analyze: single file input", ct.analyze(path.join("g", "d.py")).includes("[CLASS] Thing"));
check("lint: graceful", (await ct.lint("g/d.py")).length > 0);
check("formatCode: graceful", (await ct.formatCode("g/d.py")).length > 0);

/* ── ComputerTools ─────────────────────────────────────────────────────── */
const comp = new ComputerTools(tmp);
const unsupported = (s: string): boolean => s.includes("not supported in this build");
const mm = comp.mouse_move(10, 20);
check("mouse_move", mm === "[OK] Mouse moved to (10, 20)" || unsupported(mm), mm);
const mc = comp.mouse_click(10, 20, "right");
check("mouse_click: right", mc === "[OK] Right click at (10, 20)" || unsupported(mc), mc);
const mc2 = comp.mouse_click();
check("mouse_click: current position", mc2 === "[OK] Left click at (current, current)" || unsupported(mc2), mc2);
const mcBad = comp.mouse_click(1, 2, "banana");
check("mouse_click: bad button", mcBad.includes("unsupported button 'banana'") || unsupported(mcBad), mcBad);
const kt = comp.key_type("hello world");
check("key_type: preview", kt === "[OK] Typed: 'hello world...'" || unsupported(kt), kt);
const kp = comp.key_press("esc");
check("key_press: known key", kp === "[OK] Pressed: esc" || unsupported(kp), kp);
const kpBad = comp.key_press("notakey");
check("key_press: unknown key", kpBad.includes("unknown key 'notakey'") || unsupported(kpBad), kpBad);
const ss = comp.screen_size();
check("screen_size", /^Resolution: \d+x\d+$/.test(ss) || unsupported(ss), ss);
check(
  "as_tool_map: keys",
  Object.keys(comp.as_tool_map()).join(",") === "mouse_move,mouse_click,key_type,key_press,screen_size,screen_capture,screen_find",
  Object.keys(comp.as_tool_map()),
);
check("asToolMap: alias", Object.keys(comp.asToolMap()).length === 7);

const shot = await comp.screen_capture("shot.png");
check(
  "screen_capture: ok or clear error",
  /^\[OK\] Screenshot saved to .*shot\.png \(\d+x\d+\)$/.test(shot) || shot.startsWith("[ERROR]"),
  shot,
);
if (shot.startsWith("[OK]")) {
  const buf = fs.readFileSync(path.join(tmp, "shot.png"));
  check("screen_capture: real PNG", buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a);
  check("screen_capture: dims match message", shot.includes(`(${buf.readUInt32BE(16)}x`), shot);
}
const find = await comp.screen_find_text("zzz");
check(
  "screen_find_text: string result",
  find.startsWith("[OK] Found") || find.startsWith("[NOT FOUND]") || find.startsWith("[ERROR]"),
  find,
);

/* ── WebTools ──────────────────────────────────────────────────────────── */
const wt = new WebTools();
check("web get: error format", (await wt.get("http://127.0.0.1:1/nope")).startsWith("Error: Unable to access http://127.0.0.1:1/nope. "));
const badSearch = await wt.search("test-query-zzz");
check(
  "web search: format",
  badSearch.startsWith("Web Search Results for 'test-query-zzz':") ||
    badSearch === "Intelligence Report: No relevant information found for 'test-query-zzz'." ||
    badSearch.startsWith("Error: Search operation failed."),
  badSearch.slice(0, 120),
);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    "<html><head><style>body{}</style><script>var x=1;</script></head><body><h1>Hi</h1><p>Body   text</p></body></html>",
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const live = await wt.get(`http://127.0.0.1:${port}/page`);
check(
  "web get: strips style/script/tags + collapses whitespace",
  live === `Retrieved Content from http://127.0.0.1:${port}/page:\nHi Body text`,
  live,
);
check(
  "web get: truncation suffix",
  (await wt.get(`http://127.0.0.1:${port}/page`, 3)).includes("\n... (Content truncated for brevity, 12 total characters)"),
);
server.close();

/* ── done ──────────────────────────────────────────────────────────────── */
console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
