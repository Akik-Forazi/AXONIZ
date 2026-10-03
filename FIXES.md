## AXONIZ / AXONIZ — What was fixed

### Bugs fixed
| File | Problem | Fix |
|---|---|---|
| `core/intelligence/skill_distiller.py` | `time.strftime(...)` called but `import time` missing — would crash at first skill distillation | Added `import time` |
| `core/intelligence/__init__.py` | `SkillDistiller`, `SKILL_TEMPLATE`, `SKILLS_DIR` imported in `agent.py` but not in `__all__` — stale index warning and possible import errors | Added all three to `__all__` |
| `core/agent.py` | `SYSTEM_PROMPT` referenced in `_run_fallback` but renamed to `_FALLBACK_SYSTEM_PROMPT` | Fixed reference |
| `core/agent.py` | `ContextCompressor` double-imported from both `extras` and `intelligence` | Removed extras import |
| `core/runner.py` | `PURPLE` color variable used in `print_banner` but not defined | Added `PURPLE=_c("95")` |
| `core/runner.py` | `--web` mode manually built `WebServer` without LM Studio wiring | Now calls `startup.full_boot()` |
| `web/server.py` | `allowed` variable used in `/api/agent/params` was out of scope (defined in `/api/config/save` block only) | Renamed to `_allowed` with correct set |
| `sidecar/__init__.py` | Missing entirely — `from axoniz.sidecar import ...` would fail | Created |
| `awareness/__init__.py` | Missing entirely | Created |

### New files
| File | Purpose |
|---|---|
| `axoniz/startup.py` | 8-step ordered boot: agent → LM Studio → memory warm → workflows → awareness → Telegram → sidecar → web |
| `axoniz/sidecar/__init__.py` | Package init |
| `axoniz/awareness/__init__.py` | Package init |

### Axodex / axocode — stale index
Run this to refresh (from the project root):
```powershell
cd C:\Users\akikf\programing\nn\axoniz
npx axodex analyze
```
Or if axocode is the local binary:
```powershell
axocode analyze
```
This updates `.axodex/` to commit `1720ca4` and clears the "stale" warning.
Axodex integration into the agent will be added later as planned.
