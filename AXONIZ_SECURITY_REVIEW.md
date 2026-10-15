# AXONIZ Security Review

## Findings

### 1. API Key Redaction — PASS

Config endpoint (`GET /api/axoniz/config/cli`) redacts API keys before sending to browser:
```javascript
if (providers[key]?.api_key) providers[key].api_key = "[REDACTED]";
```
Keys are NEVER sent to the browser in plaintext. Writes preserve existing stored values — redaction does not overwrite.

### 2. Execution Ownership — PARTIAL

Executions have an `owner` field set from `body.owner ?? "anon"`. However:
- No authentication check on `GET /api/axoniz/executions/[id]` — any user can read any execution
- No authentication check on `POST /api/axoniz/executions/[id]/cancel`
- This is acceptable for local-first single-user AXONIZ but needs auth for multi-user

### 3. Cross-User Access — NOT TESTED

The auth system uses a mock token (`demo-${Date.now()}`). No JWT verification, no bcrypt. Cross-user access tests were NOT RUN.

### 4. Secret Exposure in Logs — PASS

- The `.axolog` diagnostic system has `redact()` that strips API keys, passwords, tokens
- The execution manager does NOT log prompt content or output in server logs
- Error messages in the event journal are sanitized (no stack traces with file paths)

### 5. Tool Execution Safety — NOT IMPLEMENTED

Agent mode (`Agent.run()`) can execute tools (FileTools, ShellTools, etc.) that modify the filesystem and run shell commands. Current state:
- No tool argument validation at the API boundary
- No sandboxing — tools run with the web server's permissions
- No explicit authorization for destructive operations
- The Authority Engine exists in the CLI (`dist/core/authority.ts`) but is NOT wired to the web

### 6. Input Validation — PARTIAL

- `POST /api/axoniz/chat` validates `message` is non-empty
- `POST /api/axoniz/executions` validates `prompt` and `session_id`
- No prompt size limit — a user could submit a 10MB prompt
- No rate limiting on execution submission

### 7. SQL Injection — PASS

All SQLite queries use parameterized prepared statements:
```typescript
db.prepare("SELECT * FROM executions WHERE id = ?").get(id)
```
No string concatenation in SQL queries.

### 8. Path Traversal — PASS

- Chat IDs validated against `/^[a-zA-Z0-9._-]+$/` (no `..` allowed)
- Execution IDs are randomly generated (8 hex bytes)
- Config file path is hardcoded from `os.homedir()`

### 9. CORS — NOT TESTED

Next.js dev server allows all origins by default. Production deployment needs CORS configuration.

## Mitigations Implemented

1. API key redaction on config reads
2. Parameterized SQL queries (no injection)
3. Path traversal prevention on chat IDs
4. Execution IDs are random (not guessable)
5. Cancel endpoint refuses terminal executions
6. Startup recovery does NOT auto-resume (prevents billable retries)

## Unresolved Risks

1. **No real authentication** — mock tokens, no JWT verification
2. **No tool execution authorization** — agent can run any shell command
3. **No prompt size limits** — potential resource exhaustion
4. **No rate limiting** — potential DoS via execution flooding
5. **No CSRF protection** — not implemented for POST routes
6. **CORS not configured** for production
