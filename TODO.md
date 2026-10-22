# AXONIZ — Implementation TODO

**Last updated:** 2026-10-18
**Priority order:** HIGH → MEDIUM → LOW

## 🔴 HIGH PRIORITY

### Apply studio.html design to actual AXONIZ dashboard
- [ ] Rewrite sidebar with Linear/Vercel-grade CSS (8px grid, 6-8px radii, 1px borders)
- [ ] Rewrite topbar (minimal, no colorful pills)
- [ ] Rewrite chat composer (no focus box, flowing underline animation)
- [ ] Rewrite chat message rendering (labeled lines, not bubbles)
- [ ] Apply Inter + JetBrains Mono typography
- [ ] Apply 3-level elevation shadow system
- [ ] Apply crisp 1px borders (--border / --border-strong / --border-active)
- [ ] Add glassmorphism to cards (backdrop-blur + subtle violet border)
- [ ] 150ms cubic-bezier transitions on all hover/focus/active states
- [ ] Tabular-nums on all numerals

### HTTP Backend Refactor
- [ ] Choose stack: Hono + Zod + @hono/zod-openapi
- [ ] Define ~30 REST endpoints as Zod schemas (auto-generate OpenAPI)
- [ ] Create `axoniz serve` CLI command (starts Hono HTTP server)
- [ ] Port existing API routes from Next.js catch-all to Hono routes
- [ ] Generate TypeScript client SDK from OpenAPI spec
- [ ] Replace web-next's @/lib/axoniz/cli-bridge with HTTP client
- [ ] Delete execution-manager.ts, execution-runner.ts, cli-bridge.ts
- [ ] Add mDNS discovery (--mdns flag)
- [ ] Add `axoniz attach <url>` command

### MCP Integration
- [ ] MCP Host: AXONIZ can spawn/connect to external MCP servers
- [ ] Configure via ~/.fraziym/axoniz/mcp.json
- [ ] MCP Server: axoniz-axodex (code graph queries)
- [ ] MCP Server: axoniz-palace (memory palace + KG)
- [ ] MCP Server: axoniz-forge (model downloader)
- [ ] MCP Server: axoniz-war-room (swarm orchestration)
- [ ] MCP Server: axoniz-axotest (auto-test generation)
- [ ] MCP Server: axoniz-axovb (version bumping)
- [ ] MCP Server: axoniz-xorvoid (error tracking)
- [ ] MCP Server: axoniz-xorgis (security scanning)
- [ ] MCP Server: axoniz-promochu (email automation)
- [ ] MCP Server: axoniz-voice (TTS/STT)

## 🟡 MEDIUM PRIORITY

### Workflow Engine Gaps
- [ ] Full email tool (nodemailer + SMTP config in secrets)
- [ ] Full axodex tool (call @fraziym/axodex module)
- [ ] Webhook trigger endpoint (POST /api/axoniz/v2/webhook/:wf)
- [ ] Git hook installer (axoniz template install --project foo)
- [ ] File watcher trigger (chokidar, glob + events)
- [ ] Visual workflow editor (drag-and-drop canvas, optional)
- [ ] SQLite log search index (fast search across JSONL logs)

### Sandbox + Approval Modes
- [ ] Approval modes: auto / read-only / full-access (switchable mid-session)
- [ ] Per-tool-call approval prompt (first time touching outside project folder)
- [ ] Grants system (~/.fraziym/axoniz/grants.json remembering approved expansions)
- [ ] STOP button per workflow + global STOP ALL

### Artifacts + Async Manager
- [ ] Artifacts: task lists, implementation plans, screenshots, browser recordings
- [ ] Task-level grouping (not raw tool-call logs)
- [ ] /manager page (spawn background agents on multiple workspaces)
- [ ] User feedback on artifacts (doc-style comments)

### Browser-in-the-Loop
- [ ] Headless Playwright browser automation
- [ ] Screenshot capture as artifacts
- [ ] Video recording as artifacts
- [ ] /browser page (view active browser sessions)

### Office Doc Generation
- [ ] PPTX generation (pptxgenjs)
- [ ] DOCX generation (docx)
- [ ] XLSX generation (exceljs)
- [ ] /office page (generate docs from agent output)

## 🟢 LOW PRIORITY

### Connected Project Integration
- [ ] Wire xorvoid as workflow tool + /errors dashboard page
- [ ] Wire xorgis as workflow tool + /security dashboard page
- [ ] Wire promochu as workflow tool + /email dashboard page
- [ ] Wire axomo (4 ONNX models) as MCP server
- [ ] Wire axotest as pre-commit hook + /tests dashboard page
- [ ] Wire axovb as post-commit hook + /versions dashboard page

### Polish
- [ ] npm vulnerabilities (needs node-llama-cpp@2.0.0 — breaking change)
- [ ] Mobile client (responsive dashboard)
- [ ] Slack/Teams bot (@axoniz mention)
- [ ] Desktop app (Tauri/Electron wrapper)
- [ ] Cloud sync (optional, off by default)

### Migration
- [ ] middleware.ts → proxy.ts (DONE, but verify no leftover middleware.ts)
- [ ] tree-sitter overrides verification (check if @fraziym/tree-sitters resolves)
