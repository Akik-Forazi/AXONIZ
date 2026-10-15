# AXONIZ Durable Execution Design

## Architecture

### Execution Lifecycle (shared by chat + agent)

```
User sends prompt
  → POST /api/axoniz/chat
  → submitExecution() — persists to SQLite (state: queued)
  → runExecution() — starts in background (NOT blocking HTTP)
  → Returns { execution_id } immediately

Browser connects to stream:
  → GET /api/axoniz/executions/[id]/stream?since=N
  → Replays missed events from journal
  → Polls for new events (200ms)
  → Streams as SSE: token, thinking, state_change, done
  → Closes when terminal

Browser disconnect:
  → Execution continues on backend (SQLite-persisted)
  → On reconnect: GET /api/axoniz/executions/[id]/events?since=N
  → Gets all missed events — NO duplicate generation
```

### State Machine

```
queued → running → completed
                  → failed
                  → cancelled
running → cancel_requested → cancelled
any → interrupted (process crash)
interrupted → recovery_required
```

Terminal states: `completed`, `failed`, `cancelled`

### SQLite Schema (`~/.axoniz/db/executions.db`)

```sql
executions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  mode TEXT NOT NULL,          -- 'chat' | 'agent'
  state TEXT NOT NULL,         -- state machine
  prompt TEXT NOT NULL,
  provider TEXT,               -- provider at submission time
  model TEXT,                  -- model at submission time
  output TEXT DEFAULT '',      -- accumulated output
  error TEXT,
  cancel_requested INTEGER DEFAULT 0,
  created_at REAL NOT NULL,
  started_at REAL,
  updated_at REAL,
  completed_at REAL,
  owner TEXT DEFAULT 'anon',
  recovery_note TEXT
);

events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT NOT NULL,
  seq INTEGER NOT NULL,        -- monotonically increasing per execution
  type TEXT NOT NULL,          -- 'token'|'thinking'|'state_change'|'error'|'done'
  data TEXT NOT NULL,          -- JSON
  ts REAL NOT NULL,
  UNIQUE(execution_id, seq)
);
```

### Event Protocol

| Event Type | Data | Description |
|---|---|---|
| `status` | `{id, state, output}` | Initial status on SSE connect |
| `thinking` | `{value, ts}` | Status indicator ("streaming from backend…") |
| `token` | `{value, ts}` | Streamed token from the LLM |
| `state_change` | `{state, ts}` | Lifecycle transition |
| `error` | `{error, ts}` | Error message |
| `done` | `{state, summary, ts}` | Terminal event |

### Reconnection Protocol

1. Client tracks `lastSeq` (last event sequence number received)
2. On reconnect: `GET /api/axoniz/executions/[id]/events?since=lastSeq`
3. Server returns all events with `seq > lastSeq`
4. Client processes missed events without starting a new generation
5. If execution is terminal, returns `is_terminal: true` — client shows persisted output

### Cancellation

1. Client calls `POST /api/axoniz/executions/[id]/cancel`
2. Server sets `cancel_requested = 1` and `state = 'cancel_requested'`
3. Runner checks `isCancellationRequested()` between tokens
4. If cancel is detected: transitions to `cancelled`, preserves partial output
5. Cancel does NOT just close the SSE stream — it targets the actual execution

### Startup Recovery

1. `instrumentation.ts` runs `register()` on server startup
2. `recoverOnStartup()` finds all non-terminal executions
3. Marks them as `interrupted` with a recovery note
4. Does NOT automatically resume — user must explicitly retry
5. Preserves partial output and event history

### Agent Mode

For `mode: "agent"`:
- Runner calls `Agent.run(task)` (full agent loop with tools)
- Tool calls and results are recorded in the event journal
- Agent continues even if browser disconnects
- On restart, interrupted agent executions are marked for recovery

### Recovery Limitations

- **Chat tokens**: Partial output is preserved in SQLite. Exact token-level continuation is NOT possible — the LLM generation is lost.
- **Agent tools**: Completed tool results are preserved. Uncertain tool outcomes (crash during execution) are marked `interrupted` — NOT automatically retried.
- **Model requests**: NEVER automatically retried after uncertain failure — could be billable.

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/axoniz/executions` | GET | List executions by session_id |
| `/api/axoniz/executions` | POST | Submit new execution |
| `/api/axoniz/executions/[id]` | GET | Get status + partial output |
| `/api/axoniz/executions/[id]/events` | GET | Get events since cursor |
| `/api/axoniz/executions/[id]/stream` | GET | SSE live stream + replay |
| `/api/axoniz/executions/[id]/cancel` | POST | Request cancellation |
