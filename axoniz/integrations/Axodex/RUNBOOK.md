# Runbook — Axodex

Short, copy-paste operations for **local development**, **MCP**, and **CI**. Commands assume a Unix shell; on Windows use Git Bash or equivalent paths.

## Prerequisites

- **Node.js** ≥ 20 (`axodex-web/package.json` `engines`).  
- **Git** (analyze requires a git repository).  
- From repo root, install and build the CLI package:

```bash
cd axodex
npm install
npm run build
```

Use `npx axodex …` from any path after global/published install, or `node dist/cli/index.js …` when developing from `axodex/` with a local build.

---

## Index out of date / “stale” tools

**Symptom:** MCP or resources warn the index is behind `HEAD`, or results don’t reflect recent commits.

**Fix (from the target repo root):**

```bash
npx axodex analyze
```

**Force full rebuild** (same commit but suspect corruption or changed ignore rules):

```bash
npx axodex analyze --force
```

**Check status:**

```bash
npx axodex status
```

**List what MCP knows about:**

```bash
npx axodex list
```

**Scope extraction incomplete:** `npx axodex status` reports
`incompleteReasons: ["scope-extraction-failed"]` when one or more files still
lack scope captures after the worker and fallback passes. `impact` and `context`
then report a lower bound with `causes.scopeExtractionFiles` set to the affected
file count. Re-run `npx axodex analyze --force`; if the reason remains, inspect
the scope-extraction warnings for the unsupported or malformed source file.
Every pre-existing index remains unverified until it is analyzed once by a
version that writes the completeness receipt. An older index or unreadable completeness record reports
`incompleteReasons: ["scope-extraction-unverified"]`; re-analyze it before treating
empty impact results as exact.

---

## Embeddings

**First time with vectors** (slower, more disk/RAM):

```bash
npx axodex analyze --embeddings
```

**Important:** If you already had embeddings, a plain `npx axodex analyze` **preserves** them (Non-negotiable 5 in [GUARDRAILS.md](GUARDRAILS.md)) — pass `--embeddings` when you also want vectors generated for new or changed nodes, and `--drop-embeddings` only for a deliberate wipe. See `stats.embeddings` in `.axodex/axodex.json` (or its legacy `meta.json` mirror; 0 means none) — but that figure isn't always freshly measured: if a run's embedding-count query can't answer, it carries the previous run's number forward instead of writing a wrong zero. For a certified read, check `capabilities.vectorSearch.status` instead — it reads `unavailable` (never a stale count) whenever Axodex can't vouch for the live vector index.

**Partial embedding index (analyze exits 0, but some nodes never got embedded):** A long run against a flaky embedding endpoint can finish successfully while a bounded number of sub-batches still fail. Affected nodes are dropped to zero rows (never left half-written) and recorded as a pending `embeddingCheckpoint`; `npx axodex status` then reports `incompleteReasons: ["embedding-checkpoint-pending"]`. Recovery is a plain:

```bash
npx axodex analyze
```

No `--embeddings` flag needed — a retained checkpoint forces embedding generation for the pending nodes regardless of flags, and clears once they succeed. `--drop-embeddings` abandons the pending nodes instead of retrying them; `--force` also discards the checkpoint (with a warning) and rebuilds without resuming it.

**Collapsed graph write (analyze exits NON-ZERO and says INCOMPLETE):** A run can finish writing metadata while only a fraction of the relationships it produced are readable back from the index — edges collapsing to a small share of what was built, or a `CodeRelation` table that never materialized (which reads as a persisted count of zero). Because the metadata IS written and the DB does hold rows, nothing looks broken: queries answer with missing edges rather than an error, which is a confident empty answer rather than a failure. `npx axodex status` reports `incompleteReasons: ["graph-write-collapsed"]`, the analyze summary prints `Repository indexed INCOMPLETELY` with the expected and persisted counts, and the CLI exits non-zero so automation is not told an unusable index is fine.

Recovery is a full rebuild:

```bash
npx axodex analyze --force
```

If it recurs, the cause is almost always environmental rather than a code defect: check free disk space on the volume holding `.axodex/`, make sure no second `analyze` is running against the same repo (both use `.axodex/csv` for staging), then run `npx axodex doctor`. The check compares in-memory relationship totals (including streamed rows) against what the DB hands back, and is deliberately skipped on incremental runs, where the two counts are not comparable.

**Weak semantic recall despite existing embeddings:** If paraphrased queries look like keyword-only search, the distance cutoff may be too strict for the embedding model. CLI and MCP `query` default to `0.6`. From the indexed repository, try a broader cutoff:

```bash
AXODEX_VECTOR_MAX_DISTANCE=0.8 npx axodex query "how are expired sessions removed" --limit 10
```

Compare target inclusion and ranking against the default; a broader cutoff also admits less relevant hits. Set the variable in the MCP/serve launch environment and restart that process when tuning a server. A cutoff change needs no reindex and setting it only during `analyze` does not persist it. If the index has no vectors, generate embeddings first; if the embedding model or dimensions differ between indexing and querying, align that configuration and regenerate vectors. See [Vector cutoff tuning](README.md#vector-cutoff-tuning) for validation rules and the limited `voyage-code-4` evidence from #3457.

**Large repos:** Analyze may skip or limit embedding work when node counts are very high; watch CLI output.

---

## MCP: no repos / empty tools

**Symptom:** `Axodex: No indexed repos yet` on stderr when starting MCP.

**Fix:** In each project you want indexed:

```bash
cd /path/to/repo
npx axodex analyze
```

Restart the editor MCP session if needed. The server **refreshes the registry lazily**; new analyzes are picked up without necessarily reinstalling MCP.

**Symptom:** Wrong repo when multiple are indexed — pass `repo` on tools or use `list_repos` first.

---

## Clean slate (corrupt or huge `.axodex`)

**Current repo only** (prompts for confirmation):

```bash
npx axodex clean
```

**Skip confirmation:**

```bash
npx axodex clean --force
```

**All registered repos:**

```bash
npx axodex clean --all --force
```

Then re-run `npx axodex analyze` (and `--embeddings` if you need vectors).

---

## Local bridge for the web UI

```bash
cd axodex
npx axodex serve
# default http://127.0.0.1:4747 — see serve --help for port/host
```

Use when the browser UI should talk to **local** indexed repos instead of WASM-only mode.

---

## CLI equivalents of MCP tools

Useful for debugging without an editor:

```bash
cd axodex
npx axodex query "authentication flow" --repo MyRepo
npx axodex context SomeSymbol --repo MyRepo
npx axodex impact SomeSymbol --direction upstream --repo MyRepo
npx axodex cypher "MATCH (n) RETURN count(n) LIMIT 1" --repo MyRepo
```

---

## CI failures (contributors)

Orchestrator: `.github/workflows/ci.yml`.

| Job | Typical local repro |
|-----|---------------------|
| **quality** | `cd axodex && npx tsc --noEmit` |
| **unit-tests** | `cd axodex && npx vitest run test/unit` |
| **integration** | `cd axodex && npx vitest run test/integration` (see workflow matrix for groups) |
| **e2e** | Triggered when `axodex-web/` changes; `cd axodex-web && E2E=1 npx playwright test` (requires `axodex serve` + `npm run dev`) |

**Note:** Pushes that touch only certain markdown paths may be skipped by `paths-ignore` in CI — see workflow file for exact patterns.

---

## Memory / analyze crashes

Analyze re-execs Node with a **large old-space heap** when needed (`analyze.ts`). If you still OOM on huge repos, close other processes, avoid `--embeddings` for a first pass, or analyze a smaller path if supported by your workflow.

---

## LadybugDB / lock errors

Only one process should open a repo's `.axodex/lbug` store at a time. If MCP and a second `analyze` run conflict, stop one process, then retry `analyze` or restart MCP.

If the error text is `"Only one write transaction at a time is allowed in the system."` instead of a lock/busy message, it's the same underlying conflict — our retry matcher (`isDbBusyError` in `src/core/lbug/lbug-config.ts`) recognizes this exact string and auto-retries it. The fix if it still surfaces after retries is the same: stop the overlapping process.

---

## File acquisition/reclaim guard recovery

The portable file-lock backend uses `analyze.lock.guard` beside `analyze.lock`.
Every acquisition, including an empty slot, exclusively creates the guard before
inspecting, reclaiming, creating, and verifying the main lock. It removes the
guard before returning a workload handle or waiting on a live workload holder.
Linux abstract-socket and Windows named-pipe locking are unchanged.

A stalled or crashed guard owner blocks file acquisition even when its PID is
dead, its metadata is incomplete, or no main lock exists. **The guard is never
automatically stolen.** Guard contention times out after at most 30 seconds,
capped by the remaining acquisition timeout. This separate ceiling applies even
when `AXODEX_INDEX_LOCK_TIMEOUT_MS` is zero or negative (unbounded workload wait).
A guard-cleanup failure rejects acquisition; it must not start unprotected work.

Manual recovery is an outage procedure, not an age/PID-based cleanup:

1. Identify the exact lock directory named in the error. This shared primitive
   also protects group sync and registry operations, not just repo analysis.
2. Stop **all relevant writers** and prevent restart: editor/agent hooks, watch
   processes, scheduled jobs, services, and any containers sharing the directory.
   Account for paused processes and every host with access. If quiescence cannot
   be established, do not remove the guard. PID metadata is diagnostic only.
3. While restart remains disabled, inspect and preserve the guard/main records
   for diagnosis, then remove only that directory's orphan `analyze.lock.guard`
   and, if present, its orphan `analyze.lock`. Do not remove databases or sidecars
   as part of lock recovery. Do not use a recursive or wildcard cleanup.
4. Ensure all participating writers use the guarded version and the same locking
   backend/domain, then restart in a controlled fashion.

**Upgrade requires a coordinated stop/upgrade/restart.** Concurrent older
versions ignore the guard and can still displace live locks; mixed-version
mutual exclusion is not guaranteed. The file protocol assumes reliable atomic
local-filesystem `O_EXCL` creation and cooperating processes. Network/distributed
filesystems, external file replacement, and uncoordinated manual deletion are not
covered. A process crash while holding the short-lived guard trades automatic
recovery for fail-closed safety. Denied file creation returns a non-owning
`lockFree` handle only when neither workload lock nor acquisition guard exists;
unreadable paths fail closed. No staging sweep runs without ownership. Analysis,
registry transactions, group synchronization, and embeddings sync refuse
`lockFree` handles, including an otherwise up-to-date analysis on a file-backend
read-only mount.
The socket backend can still acquire ownership on a read-only index mount.
Heterogeneous permissions are not proof that another process cannot write.

If guard cleanup fails after this attempt created its workload record, acquisition
is refused and token-exact workload cleanup is attempted before returning the
error. Failed or unverifiable cleanup must be diagnosed under the same quiesced
recovery procedure above; never delete a possibly active successor's record.

---

## Where to dig deeper

- Architecture overview: [ARCHITECTURE.md](ARCHITECTURE.md)  
- Agent safety rules: [GUARDRAILS.md](GUARDRAILS.md)  
- Tests: [TESTING.md](TESTING.md)
