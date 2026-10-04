"""
axoniz/startup.py
==================
AXONIZ-ZERO Startup Integration â€” boots every subsystem in the right order.

Handles:
  - Palace / KG memory warm-up
  - Workflow engine start
  - Awareness service start (optional)
  - Telegram bot start (if configured)
  - Sidecar connection attempt
  - Heartbeat workflow registration
  - Web server init with all managers wired

Usage (from runner or main):
    from axoniz.startup import boot_agent, boot_web
    agent = boot_agent(cfg)
    boot_web(agent, port=7860)
"""

import os
import sys
import threading
import time
from typing import Optional

from axoniz.core.config import load_config, load_config_with_autodetect, save_config
from axoniz.core.debug import info, warn, debug


# â”€â”€ Step 1: Build agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def boot_agent(cfg: dict = None, overrides: dict = None) -> "Agent":
    """
    Build and return a fully initialised Agent.
    Applies config defaults before building.
    """
    from axoniz.core.agent import Agent

    if cfg is None:
        cfg = load_config_with_autodetect()
    if overrides:
        cfg.update({k: v for k, v in overrides.items() if v is not None})

    # Ensure provider is set to llamacpp only when no provider is configured
    # in either the legacy flat keys or the modern hierarchical llm config
    active_provider = (
        cfg.get("provider")
        or cfg.get("backend")
        or cfg.get("llm", {}).get("active_provider")
    )
    if not active_provider:
        cfg["provider"] = "llamacpp"
        cfg["backend"]  = "llamacpp"

    # ✅ FIX #2: Enable standby mode for faster startup
    # Models load on first use, not at startup
    if cfg.get("standby") is None:
        cfg["standby"] = True

    info(f"[Startup] Building agent | provider={cfg.get('provider')} model={cfg.get('model_path','none')}")
    agent = Agent(**cfg)
    return agent


# â”€â”€ Step 2: Warm up memory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def boot_memory(agent: "Agent"):
    """Warm palace and KG in background â€” non-blocking."""
    def _warm():
        try:
            if agent.memory.palace.is_available():
                ctx = agent.memory.palace.get_context()
                info(f"[Memory] Palace warm | {len(ctx)} chars context loaded")
            kg_stats = agent.memory.kg.stats()
            info(f"[Memory] KG ready | {kg_stats.get('total_facts', 0)} facts")
        except Exception as e:
            warn(f"[Memory] Warm failed: {e}")
    threading.Thread(target=_warm, daemon=True, name="axoniz-mem-warm").start()


# â”€â”€ Step 3: Workflow engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def boot_workflows(agent: "Agent"):
    """Start workflow engine wired to agent."""
    try:
        from axoniz.workflows.engine import get_workflow_engine
        wf = get_workflow_engine()
        wf.set_agent_callback(agent.run)
        wf.start()
        st = wf.status()
        info(f"[Workflows] {st['total_workflows']} workflows | {st['enabled']} enabled")
        return wf
    except Exception as e:
        warn(f"[Workflows] Failed to start: {e}")
        return None


# â”€â”€ Step 4: Awareness service (optional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def boot_awareness(agent: "Agent") -> Optional[object]:
    """Start screen/context awareness service."""
    cfg = load_config()
    if not cfg.get("awareness", {}).get("enabled", False):
        debug("[Awareness] Disabled in config (set awareness.enabled=true to enable)")
        return None
    try:
        from axoniz.awareness.service import get_awareness_service

        def on_suggestion(s: str):
            """Proactive suggestion from FRAZIYM AI."""
            if agent.on_token:
                agent.on_token(f"\n[âš¡ FRAZIYM AI] {s}\n")

        svc = get_awareness_service()
        svc.set_suggestion_callback(on_suggestion)
        svc.start()
        info("[Awareness] Service started")
        return svc
    except Exception as e:
        warn(f"[Awareness] Failed to start: {e}")
        return None


# â”€â”€ Step 5: Telegram bot (optional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def boot_telegram(agent: "Agent") -> Optional[object]:
    """Start Telegram bot if token is configured."""
    try:
        from axoniz.comms.telegram import get_bot, start_bot
        bot = get_bot()
        if not bot.is_configured():
            debug("[Telegram] Not configured (set BERU_TELEGRAM_TOKEN + BERU_TELEGRAM_CHAT_ID)")
            return None
        start_bot(agent_callback=agent.run)
        info("[Telegram] Bot started")
        return bot
    except Exception as e:
        warn(f"[Telegram] Failed to start: {e}")
        return None


# â”€â”€ Step 6: Sidecar connection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def boot_sidecar() -> Optional[object]:
    """Connect to Jarvis Go sidecar if running."""
    try:
        from axoniz.sidecar.client import get_sidecar
        sc = get_sidecar()
        if sc.is_alive():
            info(f"[Sidecar] Connected at {sc.base_url}")
            return sc
        else:
            debug("[Sidecar] Not running (optional â€” install Jarvis sidecar to enable)")
            return None
    except Exception as e:
        warn(f"[Sidecar] Connection failed: {e}")
        return None


# â”€â”€ Step 7: Web server with everything wired â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def boot_web(
    agent: "Agent",
    port: int = 7860,
    host: str = "localhost",
    open_browser: bool = True,
) -> None:
    """
    Start web server with all subsystems wired.
    Blocks until Ctrl+C.
    """
    from axoniz.web.server import WebServer

    ws = WebServer(agent=agent, host=host, port=port)
    ws.start(open_browser=open_browser)


# â”€â”€ Full boot sequence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def full_boot(
    cfg: dict = None,
    overrides: dict = None,
    port: int = 7860,
    open_browser: bool = True,
    web: bool = True,
) -> "Agent":
    """
    Boot everything in the correct order and return the agent.
    If web=True, blocks serving the web UI.

    Startup sequence:
      1. Build Agent
      2. Memory warm-up
      3. Workflow engine
      4. Awareness service (if enabled)
      5. Telegram bot (if configured)
      6. Sidecar connection
      7. Web server (blocks)
    """
    _print_boot_header()

    agent = boot_agent(cfg, overrides)
    _print_step("Agent",    f"provider={agent.config.get('provider')} workspace={agent.workspace}")

    boot_memory(agent)
    _print_step("Memory", "palace + KG warming")

    # â”€â”€ Phase: Axodex Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ax_status = agent.axodex.status()
    if "ERROR" in ax_status:
        _print_step("Axodex", f"\033[91mNo index found\033[0m (Run 'axodex analyze')")
    else:
        _print_step("Axodex", "Graph index active")

    boot_workflows(agent)
    _print_step("Workflows", "engine running")

    boot_awareness(agent)
    _print_step("Awareness", "started" if load_config().get("awareness", {}).get("enabled") else "disabled")

    boot_telegram(agent)

    sc = boot_sidecar()
    _print_step("Sidecar", "connected" if sc else "offline (optional)")

    print()

    if web:
        boot_web(agent, port=port, open_browser=open_browser)

    return agent


# â”€â”€ Print helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _c(code):
    if os.environ.get("NO_COLOR") or not (hasattr(sys.stdout, "isatty") and sys.stdout.isatty()):
        return ""
    return f"\033[{code}m"

R  = _c("0");  DG = _c("90"); GR = _c("37"); GB = _c("92")
WH = _c("97"); B  = _c("1");  PU = _c("95"); CY = _c("96")

def _print_boot_header():
    print()
    print(f"  {PU}{B}AXONIZ-ZERO - FRAZIYM AI{R}  {DG}booting...{R}")
    print()

def _print_step(name: str, detail: str):
    status = f"{GB}+{R}" if "fail" not in detail.lower() and "error" not in detail.lower() else f"\033[91m-{R}"
    print(f"  {status}  {DG}{name:<14}{R}{GR}{detail}{R}")

