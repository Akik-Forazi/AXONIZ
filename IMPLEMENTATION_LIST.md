# AXONIZ — Implementation List

**Version:** 0.1.8-beta.1
**Date:** 2026-10-18

## What's Done ✅

### Infrastructure
1. ✅ `web-next` renamed to `web` (git mv, all refs updated)
2. ✅ Scratch files deleted (20+ files: _*.mjs, _*.py, _pyref/, *.bat)
3. ✅ Outdated audit docs deleted (8 AXONIZ_*.md files)
4. ✅ `workspaces: ["web"]` in root package.json
5. ✅ `middleware.ts` → `proxy.ts` (Next.js 16)
6. ✅ Tree-sitter npm overrides (16 packages → @fraziym/tree-sitters)
7. ✅ `gypfile: false` in root package.json
8. ✅ Turbopack filesystem warning fixed (`/*turbopackIgnore: true*/`)

### Theming
9. ✅ Theme registry: Monochrome Dark + Shadow Monarch
10. ✅ `[data-theme="shadow-monarch"]` CSS variable overrides in globals.css
11. ✅ Zustand store: `activeTheme` + `setTheme` (persisted, v9 migrate)
12. ✅ ThemeProvider applies `<html data-theme="...">`
13. ✅ Theme picker UI in Settings → Appearance (swatch cards)
14. ✅ Shadow Monarch is the DEFAULT theme
15. ✅ Store v9 migrate merges new providers (preserves API keys)

### Event Stream
16. ✅ EventStreamProvider (singleton, survives navigation, auto-reconnect)
17. ✅ /event-stream page (full-screen viewer with Clear button)
18. ✅ EventRail side panel DELETED (was eating 288px on every page)
19. ✅ "Event Stream" in sidebar nav (Terminal icon)

### Chat Stream
20. ✅ ChatStreamProvider (singleton per-execution EventSource, survives navigation)
21. ✅ useChatStream rewritten (reads/writes via Zustand store, not local useState)
22. ✅ EMPTY_MESSAGES stable constant (fixes infinite "Maximum update depth exceeded")
23. ✅ Streaming tokens append to ONE message (pending stays true throughout stream)
24. ✅ Token persistence to JSONL (fire-and-forget POST)

### Providers
25. ✅ OrcaRouter added as 15th provider (OpenAI-compatible gateway)
26. ✅ OrcaRouter in CLI backend dispatch (openAICompatible Set)
27. ✅ OrcaRouter in providers test route (case "orca")
28. ✅ OrcaRouter in CLI runner.ts PROVIDERS array + help text
29. ✅ Null checks for undefined providers (5 locations with ?? fallback)
30. ✅ Store v9 migrate (merges DEFAULT_PROVIDERS, preserves user API keys)

### v2: Projects
31. ✅ v2-schemas.ts (Zod: ProjectMeta, Workflow, WorkflowStep, LogEntry, WorkflowRun)
32. ✅ v2-projects.ts (registerProject + auto-detect: git/npm/TS/Next.js/framework/tests/docker)
33. ✅ /projects dashboard page (register + manage folders with detection badges)
34. ✅ POST/GET/DELETE /api/axoniz/v2/projects[/:id]

### v2: Workflows
35. ✅ v2-workflows.ts (YAML parser + sequential runner + mustache templating)
36. ✅ /workflows dashboard page (YAML editor + run + runs list)
37. ✅ POST/GET/DELETE /api/axoniz/v2/workflows[/:name]
38. ✅ POST /api/axoniz/v2/workflows/:name/run (manual trigger)
39. ✅ GET /api/axoniz/v2/runs[/:id]
40. ✅ Per-step timeoutSec (default 60s)
41. ✅ Per-workflow maxMinutes (default 30min)
42. ✅ onError handler support

### v2: Workflow Tools (10 total)
43. ✅ `http` — GET/POST/PUT/DELETE with headers + body
44. ✅ `file` — read/write/append/list
45. ✅ `shell` — exec with cwd + timeout
46. ✅ `agent` — POST /api/axoniz/chat + poll execution status
47. ✅ `log` — custom log line with level
48. ✅ `email` — send email (logs for now, SMTP pending)
49. ✅ `slack` — incoming webhook URL
50. ✅ `github` — REST API with token auth
51. ✅ `palace` — store/read/list from ~/.axoniz/palace/
52. ✅ `axodex` — placeholder (full impl pending)

### v2: Triggers
53. ✅ `manual` — POST /workflows/:name/run
54. ✅ `schedule` — built-in cron parser + setInterval (no node-cron dependency)

### v2: Logs
55. ✅ JSONL log writer (~/.axoniz/projects/:id/logs/ or ~/.axoniz/logs/)
56. ✅ In-memory ring buffer (last 200 entries)
57. ✅ /logs dashboard page (auto-refresh every 5s, filter, level icons)
58. ✅ GET /api/axoniz/v2/logs + GET /api/axoniz/v2/projects/:id/logs

### v2: Secrets
59. ✅ v2-secrets.ts (~/.axoniz/secrets.json, mode 0600)
60. ✅ GET /api/axoniz/v2/secrets (lists keys only, never values)
61. ✅ POST /api/axoniz/v2/secrets (set key/value)
62. ✅ DELETE /api/axoniz/v2/secrets/:key
63. ✅ Workflows reference secrets via {{secrets.foo}}

### v2: Templates
64. ✅ v2-templates.ts (5 starter templates)
65. ✅ auto-test-on-push.yml
66. ✅ security-scan-pre-commit.yml
67. ✅ daily-news-summary.yml
68. ✅ version-bump-on-commit.yml
69. ✅ github-pr-digest.yml
70. ✅ GET /api/axoniz/v2/templates
71. ✅ initTemplates() called on server startup via instrumentation.ts

### v2: Scheduler
72. ✅ v2-scheduler-server.ts (built-in setInterval + cron parser, zero deps)
73. ✅ instrumentation.ts (Next.js server-side init)
74. ✅ refreshSchedule() scans every 60s for new workflows
75. ✅ Cron expression parser (*, */N, ranges, comma lists)
76. ✅ Deduplication (won't run same wf twice in same minute)

### Bug Fixes
77. ✅ 401 on /model/switch (parent project mock-error wrapper → 400)
78. ✅ Infinite loop in useChatStream (EMPTY_MESSAGES stable constant)
79. ✅ Providers page crash (null check ?? fallback in 5 locations)
80. ✅ SchedulerProvider crashed all pages (moved to instrumentation.ts)
81. ✅ node-cron build failure (removed entirely, built-in scheduler)
82. ✅ Streaming tokens as separate bubbles (pending stays true)
83. ✅ Agent HTTP 400 (added session_id to POST body)
84. ✅ Recent chats on /agent page (sidebar showChats only on /chat)
85. ✅ postinstall infinite loop (removed postinstall, kept workspaces)

## What's NOT Done ❌

### Design (HIGH)
86. ❌ Apply studio.html design to actual dashboard components
87. ❌ Glassmorphism on cards/panels
88. ❌ Linear/Vercel-grade typography (Inter + JetBrains Mono)
89. ❌ 8px grid spacing system
90. ❌ Crisp 1px borders (3-tier: resting/hover/active)
91. ❌ 3-level elevation shadow system
92. ❌ Flowing underline animation on composer
93. ❌ 150ms cubic-bezier transitions

### Architecture (HIGH)
94. ❌ HTTP backend refactor (Hono + Zod + OpenAPI)
95. ❌ Auto-generated client SDK from OpenAPI
96. ❌ Delete @/lib/axoniz/cli-bridge, execution-manager, execution-runner
97. ❌ `axoniz serve` CLI command
98. ❌ `axoniz attach <url>` command
99. ❌ mDNS discovery

### MCP (HIGH)
100. ❌ MCP Host (consume external MCP servers)
101. ❌ MCP Server: axoniz-axodex
102. ❌ MCP Server: axoniz-palace
103. ❌ MCP Server: axoniz-forge
104. ❌ MCP Server: axoniz-war-room
105. ❌ MCP Server: axoniz-axotest
106. ❌ MCP Server: axoniz-axovb
107. ❌ MCP Server: axoniz-xorvoid
108. ❌ MCP Server: axoniz-xorgis
109. ❌ MCP Server: axoniz-promochu
110. ❌ MCP Server: axoniz-voice

### Workflow Engine (MEDIUM)
111. ❌ Full email tool (nodemailer + SMTP)
112. ❌ Full axodex tool (call @fraziym/axodex)
113. ❌ Webhook trigger endpoint
114. ❌ Git hook installer
115. ❌ File watcher trigger (chokidar)
116. ❌ Visual workflow editor
117. ❌ SQLite log search index

### Sandbox (MEDIUM)
118. ❌ Approval modes (auto/read-only/full-access)
119. ❌ Per-tool-call approval prompt
120. ❌ Grants system (~/.axoniz/grants.json)
121. ❌ STOP button per workflow + global STOP ALL

### Artifacts (MEDIUM)
122. ❌ Task lists, implementation plans
123. ❌ Screenshots, browser recordings
124. ❌ /manager page (async multi-agent)
125. ❌ User feedback on artifacts

### Browser (LOW)
126. ❌ Headless Playwright browser automation
127. ❌ Screenshot capture as artifacts
128. ❌ /browser page

### Office Docs (LOW)
129. ❌ PPTX generation
130. ❌ DOCX generation
131. ❌ XLSX generation
132. ❌ /office page

### Connected Projects (LOW)
133. ❌ Wire xorvoid (error tracking) as tool + /errors page
134. ❌ Wire xorgis (security) as tool + /security page
135. ❌ Wire promochu (email) as tool + /email page
136. ❌ Wire axomo (ONNX models) as MCP server
137. ❌ Wire axotest as pre-commit hook + /tests page
138. ❌ Wire axovb as post-commit hook + /versions page

### Other (LOW)
139. ❌ npm vulnerabilities (needs node-llama-cpp@2.0.0 — breaking)
140. ❌ Mobile client
141. ❌ Slack/Teams bot
142. ❌ Desktop app (Tauri/Electron)
143. ❌ Cloud sync
