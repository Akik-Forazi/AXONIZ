# AXONIZ SYSTEM: THE autonomous DEVELOPER MANUAL
*(Generated via AXODEX Semantic Knowledge Graph)*

## 1. System Philosophy: "The Shadow Monarch's Eye"
Axoniz is not just a chatbot; it is a **multi-phase autonomous agent framework** (codenamed AXONIZ) designed to operate with 70B-parameter precision using efficient 3B-7B local models. It achieves this through:
- **Graph Intelligence**: Deep codebase understanding via Axodex.
- **Trajectory Store**: Self-correction and loop detection in tool execution.
- **Swarm Orchestration**: Parallelizing heavy tasks across sub-agents.

---

## 2. Boot & Lifecycle Scenario
### **What happens when you run `python axoniz_main.py`?**
1. **Runner Init (`axoniz/core/runner.py`)**:
   - Loads global config from `~/.axoniz/config.json`.
   - **Scenario: Legacy Config**: If old flat configs are detected, `migrate_legacy_config` triggers to convert them to hierarchical structures.
   - **Scenario: No Model**: If no model path is provided, an interactive selector (`_interactive_model_select`) pops up to list available GGUFs in the `MODELS_DIR`.
2. **Agent Build (`Agent.__init__`)**:
   - Initializes `UnifiedMemory` (TF-IDF + Palace).
   - Sets up **Intelligence Phases**: TrajectoryStore (Phase 1), SwarmOrchestrator (Phase 2), ASTIndexer (Phase 3).
3. **LLM Loading**:
   - `ensure_llm()` calls `_build_llm()` to spawn the LlamaCpp server or connect to Ollama.
   - **Wait Loop**: The system blocks until the server responds at `/health`.

---

## 3. Tool Execution & Self-Correction
### **How does `Agent._exec(name, args)` work?**
When the LLM outputs `<tool>{...}</tool>`, the system enters the execution cycle:
1. **Permission Check**: `_get_authority()` verifies if the agent has the level (1-5) required for the tool.
2. **Execution**: The tool is dispatched to `FileTools`, `ShellTools`, or `AxodexTools`.
3. **Trajectory Tracking (`TrajectoryStore`)**:
   - Every tool call and result is logged.
   - **Scenario: Error Detected**: If a tool returns an error, `SelfCorrector.classify_error` determines if it's a `SyntaxError`, `PathError`, or `LogicError`.
   - **Correction**: The system injects a "Self-Correction" prompt (e.g., "The previous file write failed because the directory doesn't exist. Create the directory first.") into the next reasoning step.

---

## 4. Autonomous Goal Mode (LoopEngine)
### **The Mission Cycle (`axoniz/core/loop.py`)**
Triggered via `axoniz goal "..."`.
1. **Planning**: `_plan()` uses the LLM to generate a JSON array of sub-tasks.
2. **Execution**: The `LoopEngine` iterates through tasks. Each task is passed to `Agent.run()`.
3. **Verification**: After a task completes, `_verify()` is called.
   - **Why?** To ensure the agent didn't just *say* it was done without actually achieving the success condition.
   - **How?** The LLM reviews the session evidence against the `verify` string in the plan.
4. **Replanning**: If verification fails, `_replan()` is triggered to pivot the strategy.

---

## 5. Swarm Orchestration (Worker Swarm)
### **Scenario: Massive Refactor or Research**
When a task is too large for a single context, `run_swarm()` is used:
1. **Decomposition**: `SwarmOrchestrator` splits the task into independent `SubTask` objects.
2. **Parallel Workers**: Multiple `SwarmWorker` instances are spawned (default 4).
3. **Critic Review**: Each worker's output is reviewed by a `SwarmCritic` (Phase 2.5).
4. **Merge**: `SwarmMerger` synthesizes the sub-task results into a final report.

---

## 6. Proactive Awareness (Phase 7)
### **The Observer Loop (`axoniz/awareness/service.py`)**
A background daemon that makes Axoniz feel "alive":
1. **Context Snapshot**: Every 60s, it captures:
   - **Active Window**: What application are you in?
   - **Clipboard**: What did you just copy?
   - **OCR (Optional)**: Text content on the screen.
2. **Suggestion Engine**: `SuggestionEngine.evaluate()` checks if the current context matches a "trigger rule" (e.g., you are in VS Code looking at a traceback).
3. **Intervention**: If a match is found, AXONIZ sends a proactive message: *"I see you're debugging X. Should I analyze the logs for you?"*

---

## 7. Communication & Remote Control
### **Telegram Integration (`axoniz/comms/telegram.py`)**
The bot acts as a bridge between the local agent and your mobile device:
- **Authority Gates**: If the agent wants to run `rm -rf`, it can send a message to Telegram. You reply `/approve [id]` to let it proceed.
- **Remote Ask**: Send `/ask "summarize my progress"` while away from your PC.
- **Heartbeats**: The `axonizDaemon` sends periodic health updates to your chat.

---

## 8. Critical Breaking Points & Troubleshooting
| Component | What Breaks It | Symptom | Fix |
| :--- | :--- | :--- | :--- |
| **Axodex** | Renaming folders or deleting `.axodex` | `AxodexTools` returns empty | Run `axodex analyze . --skip-git` |
| **LLM Backend** | Port conflict (8080) or OOM | Agent hangs on `ensure_llm` | Check `taskmanager` for zombie `llama-server.exe` |
| **Auth Engine** | Missing `default.yaml` | Authority level resets to 1 | Verify `axoniz/roles/default.yaml` exists |
| **Awareness** | Missing `psutil` or `pytesseract` | Suggestion loop stops | `pip install psutil pytesseract` |

---

*This manual was synthesized using AXODEX v1.2.0 on 2026-06-12.*
