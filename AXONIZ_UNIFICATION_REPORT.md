# AXONIZ Unification Report

## Configuration Consolidation

### Before
- CLI config: `~/.axoniz/config.json` (canonical, used by Agent + get_backend())
- Web config: `~/.axoniz/db/config.json` (duplicate, used by boot.ts + settings page)
- Web provider catalog: `PROVIDER_CATALOG` in `axoniz-store.ts` (14 hardcoded providers)

### After
- CLI config: `~/.axoniz/config.json` (STILL canonical)
- Web reads config via `GET /api/axoniz/config/cli` → `loadCliConfig()` from dist
- Web writes config via `POST /api/axoniz/config/cli` → `saveCliConfig()` to dist
- Boot hook loads from `/api/axoniz/config/cli` (not `/api/axoniz/db/config`)
- API keys redacted on read (`"[REDACTED]"`), never overwritten with placeholder

### Provider Selection Path (unified)
```
Web UI → POST /api/axoniz/chat
  → submitExecution() — records provider from loadCliConfig()
  → runExecution() — creates Agent from loadCliConfig()
  → Agent.chatStream() → get_backend() → LlamaCppBackend/OpenAIBackend/etc
  → actual LLM provider
```

No direct provider HTTP calls from the web. No duplicate provider catalog in the execution path.

### Files Changed

| File | Change |
|---|---|
| `web-next/src/lib/axoniz/cli-bridge.ts` | Added `loadCliConfig()`, `saveCliConfig()`, `createAgent()`, `streamAgentChat()` |
| `web-next/src/app/api/axoniz/config/cli/route.ts` | NEW — GET/POST CLI's config.json |
| `web-next/src/components/axoniz/boot.ts` | REWRITE — loads from `/api/axoniz/config/cli` |
| `web-next/src/app/api/axoniz/chat/route.ts` | REWRITE — submits durable execution |

### Intentional Exceptions

1. `PROVIDER_CATALOG` in `axoniz-store.ts` — still used by the Settings page for displaying provider names/icons. This is presentation-only metadata, not provider behavior. Should be replaced with metadata from CLI config in a follow-up.

2. `~/.axoniz/db/config.json` — not yet removed. Needs migration of any remaining consumers (Settings page's `save()` function still writes to both). Safe to remove after confirming all callers use `/api/axoniz/config/cli`.

3. `/api/axoniz/models/launch/route.ts` — web's own llama-server spawn. Should eventually use CLI's `LlamaCppServerBackend.ensureServer()`, but currently works standalone.
