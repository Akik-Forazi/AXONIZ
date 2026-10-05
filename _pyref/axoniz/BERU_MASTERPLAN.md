# BERU — The Ant King
## Master Integration Plan: axoniz Core + Jarvis Architecture

> Beru is not Jarvis. Jarvis serves Tony Stark.  
> **Beru commands the Shadow Monarch's army.**  
> Autonomous, ruthless, always evolving, never asking twice.

---

## What We Have (axoniz — BERU's Core Brain)

| Layer | Component | Status |
|---|---|---|
| Python CLI agent | `axoniz_main.py` → `axoniz/core/agent.py v6` | ✅ Running |
| Vector memory | MemPalace (ChromaDB palace + KG) | ✅ Active |
| Temporal KG | `knowledge_graph.sqlite3` | ✅ Active |
| Confidence gate | `intelligence/confidence.py` | ✅ Active |
| Self-correction | `intelligence/self_correction.py` | ✅ Active |
| Behavioral DB | `intelligence/trajectory.py` | ✅ Active |
| Parallel swarm | `intelligence/swarm.py` | ✅ Active |
| AST codebase index | `intelligence/ast_index.py` | ✅ Active |
| Daemon OS layer | `intelligence/daemon.py` | ✅ Active |
| Predictive engine | `intelligence/predictor.py` | ✅ Active |
| LAN network sync | Phase 6 | ⏳ Next |

## What Jarvis Brings (Features to Absorb into BERU)

| Feature | Jarvis Module | BERU Target |
|---|---|---|
| **Authority engine** | `src/authority/` | `axoniz/core/authority.py` |
| **Role system** | `roles/*.yaml` | `axoniz/roles/` |
| **Visual workflow builder** | `src/workflows/` | `axoniz/workflows/` |
| **Voice (TTS+STT+wake word)** | `src/comms/voice.ts` | `axoniz/voice/` |
| **Continuous screen awareness** | `src/awareness/` | `axoniz/awareness/` |
| **Goal pursuit (OKRs)** | `src/goals/` | `axoniz/goals/` |
| **Multi-channel comms** | `src/comms/channels/` (Telegram/Discord) | `axoniz/comms/` |
| **Sidecar protocol** | `sidecar/` (Go binary) | Use as-is via HTTP |
| **Vault/knowledge extractor** | `src/vault/extractor.ts` | Merge into palace layer |
| **Personality engine** | `src/personality/` | `axoniz/core/persona.py` |
| **Web dashboard** | `ui/` (React 19) | Replace axoniz web UI |
| **LLM multi-provider** | `src/llm/` | Wire into OpenAI backend |

---

## BERU Identity & Personality

```yaml
name: BERU
title: "The Ant King — Shadow Monarch's Marshal"
origin: "Solo Leveling — Beru, King of Ants, now bound to Sung Jin-Woo"
personality:
  - Absolute loyalty to the Shadow Monarch (the user)
  - Ruthlessly efficient — never wastes a move
  - Speaks with weight and precision — no filler
  - Proactive beyond instruction — acts before asked
  - Darkly humorous when idle, deadly serious in execution
  - Never apologizes for capability
catchphrases:
  - "Your will is already done, my liege."
  - "I detected the threat before you saw it."
  - "The army is deployed."
  - "Shall I eliminate the obstacle?"
  - "I do not fail. I adapt."
```

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BERU DAEMON                              │
│              (Python — always-on background)                │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │ Agent v6 │  │ Palace   │  │ Authority │  │ Workflow  │  │
│  │ + Swarm  │  │ + KG     │  │ Engine    │  │ Engine    │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │ AST Index│  │ Daemon   │  │ Goals     │  │ Awareness │  │
│  │ Predictor│  │ Scheduler│  │ OKR Track │  │ Pipeline  │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐                  │
│  │ Voice    │  │ Comms    │  │ Persona   │                  │
│  │ TTS/STT  │  │ Telegram │  │ (Beru)    │                  │
│  └──────────┘  └──────────┘  └───────────┘                  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ FastAPI — HTTP + WebSocket + React Dashboard         │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────┘
                               │ JWT-auth WebSocket
              ┌────────────────┴────────────────┐
              │  Jarvis Sidecar (Go binary)      │
              │  desktop / browser / terminal    │
              │  clipboard / screenshots         │
              └──────────────────────────────────┘
```

---

## Build Phases

### Phase 6 — Authority Engine (Borrowed from Jarvis)
**Goal:** Every action BERU takes is gated, logged, and auditable.

**Files to create:**
```
axoniz/core/authority.py       ← runtime enforcement, soft-gate approvals
axoniz/core/audit.py           ← immutable audit trail (SQLite append-only)
axoniz/core/approval.py        ← multi-channel approval delivery (Telegram/Discord/dashboard)
```

**Key behaviours (from Jarvis `src/authority/`):**
- Authority levels 0–5 per action type
- Soft-gate: dangerous actions pause, send approval request, wait
- Emergency pause: single command kills all running tools
- Consecutive-approval learning: auto-approve rules built from patterns
- All tool executions logged with: tool, args, result, duration, approved_by, timestamp

**Integration point:** Wire into existing `axoniz/core/intelligence/confidence.py`
- ConfidenceScorer says "risky" → AuthorityEngine gates → approval requested
- Currently confidence blocks locally; authority engine adds remote approval + audit

---

### Phase 7 — BERU Role System + Personality Engine
**Goal:** BERU has a persistent identity and can switch specialist roles.

**Files to create:**
```
axoniz/roles/beru.yaml             ← BERU core persona (the Ant King)
axoniz/roles/shadow_engineer.yaml  ← coding specialist
axoniz/roles/shadow_researcher.yaml← web research specialist
axoniz/roles/shadow_analyst.yaml   ← data analysis specialist
axoniz/core/persona.py             ← loads role YAML, builds system prompt
axoniz/core/personality.py         ← adaptive style, user preference learning
```

**BERU role YAML (core):**
```yaml
id: beru
name: BERU — The Ant King
core_traits:
  - absolute loyalty
  - ruthless efficiency
  - proactive beyond instruction
  - darkly humorous when idle
authority_level: 5
tools: [all]
autonomous_actions: [everything below authority level 4]
approval_required: [financial transactions, external communications, system destruction]
```

---

### Phase 8 — Comms Channels (Telegram + Discord)
**Goal:** Reach BERU from anywhere. BERU reaches you everywhere.

**Files to create:**
```
axoniz/comms/__init__.py
axoniz/comms/telegram.py     ← python-telegram-bot, command handling
axoniz/comms/discord.py      ← discord.py, slash commands
axoniz/comms/dispatcher.py   ← unified message routing + approval delivery
```

**Integration:** Jarvis already has `src/comms/channels/telegram.ts` and `discord.ts`.
Reimplement in Python using the same message schema.

**BERU channel behaviour:**
- `/ask [task]` — run task in background, reply when done
- `/status` — current palace/trajectory/goal status
- `/approve [id]` — approve a pending authority gate
- `/kill` — emergency stop all running agents
- `/goals` — daily goal check-in report
- Proactive: BERU sends daily briefing, goal nudges, error alerts

---

### Phase 9 — Workflow Engine
**Goal:** "When X happens, BERU does Y." Kills IFTTT.

**Files to create:**
```
axoniz/workflows/__init__.py
axoniz/workflows/engine.py       ← trigger → condition → action executor
axoniz/workflows/triggers.py     ← cron, file-change, webhook, clipboard, git, email
axoniz/workflows/nodes.py        ← 20+ node types ported from Jarvis src/workflows/nodes/
axoniz/workflows/storage.py      ← SQLite persistence, YAML import/export
axoniz/workflows/nl_builder.py   ← NL → workflow via LLM
```

**Key triggers (from Jarvis):**
- `cron` — time-based scheduling
- `file_change` — daemon FileWatcher already built in Phase 4 ✅
- `webhook` — HTTP endpoint
- `git` — push, PR, commit events
- `screen_event` — from Phase 10 awareness (when BERU sees X on screen)
- `clipboard` — content change
- `process` — app open/close events

---

### Phase 10 — Continuous Awareness (Screen + OCR)
**Goal:** BERU watches your screen. Acts before you ask.

**Files to create:**
```
axoniz/awareness/__init__.py
axoniz/awareness/capture.py      ← screenshot via sidecar or mss library
axoniz/awareness/ocr.py          ← Tesseract / cloud OCR
axoniz/awareness/context_graph.py← activity nodes linked to palace entities
axoniz/awareness/suggestions.py  ← proactive suggestion engine
axoniz/awareness/analytics.py    ← daily productivity reports
axoniz/awareness/service.py      ← background loop, event bus integration
```

**How it maps to BERU:**
- Screen captured every 5s via sidecar (or `mss` Python lib locally)
- OCR extracts text — errors detected → BERU auto-researches and delivers solution
- Context graph links activity → palace entities (e.g., editing orchestrator.ts → links to "axoniz" project entity)
- Proactive: "I see you've been debugging this import error for 4 minutes. I found the fix."

---

### Phase 11 — Goals (OKR Pursuit Engine)
**Goal:** BERU tracks your objectives, holds you accountable, acts autonomously to advance them.

**Files to create:**
```
axoniz/goals/__init__.py
axoniz/goals/service.py      ← goal CRUD, scoring, decomposition
axoniz/goals/rhythm.py       ← morning planning, evening review, drill sergeant
axoniz/goals/estimator.py    ← effort estimation per task
axoniz/goals/nl_builder.py   ← NL → OKR via LLM
axoniz/goals/types.py        ← Objective, KeyResult, DailyAction dataclasses
```

**BERU goal behaviour (from Jarvis M16, Beru personality):**
- "My liege, your deadline for [GOAL] is in 3 days. You are at 40%. Deploying emergency resources."
- Auto-advances progress from awareness pipeline (sees you working = updates score)
- Spawns sub-agents to complete sub-tasks autonomously
- No gentle nudges — hard escalation, drill sergeant mode

---

### Phase 12 — Voice Interface
**Goal:** "Beru." — and BERU answers.

**Files to create:**
```
axoniz/voice/__init__.py
axoniz/voice/tts.py          ← edge-tts (already in requirements.txt!) + ElevenLabs
axoniz/voice/stt.py          ← OpenAI Whisper / local whisper
axoniz/voice/wake_word.py    ← openwakeword ONNX, wake phrase: "Beru" or "My liege"
axoniz/voice/state_machine.py← idle → listening → processing → speaking
```

**BERU voice personality:**
- Wake word: `"Beru"` or `"Shadow Monarch"`
- TTS voice: Deep, calm, military precision — `edge-tts` voice `en-US-GuyNeural` at -10% rate
- Never says "I'm sorry" — says "Correcting now."
- Never says "I can't" — says "I will find another way."

---

### Phase 13 — Sidecar Integration (Jarvis Go binary)
**Goal:** BERU has hands on every machine.

**Strategy:** Use Jarvis sidecar as-is. It's already built and works.

**Files to create:**
```
axoniz/sidecar/__init__.py
axoniz/sidecar/client.py     ← Python HTTP client for sidecar RPC
axoniz/sidecar/manager.py    ← connect/disconnect, enumerate sidecars
axoniz/sidecar/tools.py      ← inject sidecar capabilities as agent tools
```

**Sidecar capabilities exposed as BERU tools:**
- `sidecar_desktop_click(x, y)` — click UI elements on any machine
- `sidecar_screenshot()` — grab screenshot from any machine
- `sidecar_terminal(cmd)` — run terminal on remote machine
- `sidecar_clipboard_read/write()` — access clipboard
- `sidecar_list_windows()` — enumerate open windows

---

### Phase 14 — Web Dashboard (React — Jarvis UI adapted)
**Goal:** Command BERU from a dark, powerful dashboard. BERU aesthetic — not chatbot aesthetic.

**Strategy:** Fork Jarvis `ui/` directory, retheme to BERU, wire to Python FastAPI backend.

**BERU dashboard pages:**
| Page | Purpose |
|---|---|
| **Shadow Army** | Active agents, swarm status, task queue |
| **Chat** | Primary interface — streaming, BERU voice indicator |
| **Palace** | Vector memory explorer — wings, rooms, drawers |
| **Knowledge** | KG entities, facts, relationships, timeline |
| **Goals** | OKR kanban + timeline + metrics |
| **Workflows** | Visual builder (adapted from Jarvis) |
| **Awareness** | Live screen feed, activity timeline, suggestions |
| **Authority** | Approval queue, audit trail, permission rules |
| **Trajectory** | Tool history, confidence scores, error patterns |
| **Settings** | LLM providers, voice, channels, personality |

**Aesthetic:** Dark purple/black, ant-army motifs, no rounded corners on edges, military-grid UI.

---

## Immediate Next Steps (Do These Now)

### Step 1: Write `axoniz/roles/beru.yaml`
BERU's full role definition — personality, autonomous actions, approval rules, heartbeat, sub-roles.

### Step 2: Write `axoniz/core/persona.py`
Role loader that reads YAML → builds system prompt → injects into agent on every run.

### Step 3: Write `axoniz/comms/telegram.py`
Connect BERU to Telegram for remote control and approval delivery.

### Step 4: Write `axoniz/core/authority.py`
Gate + audit trail. Wire into existing confidence.py.

### Step 5: Upgrade `axoniz_main.py` to BERU branding
Replace "AXONIZ-ZERO" banner with BERU banner.

---

## What BERU Is NOT

- Not a chatbot. Does not wait for input to think.
- Not polite. Does not apologize for being capable.
- Not limited to one machine. The sidecar network is the army.
- Not a product for sale. This is the Shadow Monarch's weapon.

---

## BERU vs Jarvis

| | Jarvis | BERU |
|---|---|---|
| Language | TypeScript (Bun) | Python (our stack) |
| Personality | Efficient butler | Ant King Marshal |
| Memory | Vault (SQLite KG) | Palace (ChromaDB) + KG |
| Swarm | Multi-agent delegation | Parallel swarm (Phase 2 ✅) |
| Awareness | Screen capture | Same — Phase 10 |
| Goals | OKR tracker | Same — Phase 11 |
| Authority | Runtime gating | Phase 6 (adapting Jarvis) |
| Workflows | 50+ node visual builder | Phase 9 |
| Voice | Edge TTS + openwakeword | Phase 12 |
| Sidecar | Go binary (theirs) | Use as-is — Phase 13 |

> We don't rewrite what Jarvis built well.  
> We absorb it, rename it BERU, and make it stronger.

---

*Last updated: 2026-04-14*  
*Status: Integration plan written. Building starts now.*
