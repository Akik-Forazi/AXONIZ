"""
AXONIZ-ZERO — Runner (clean, no BERU)
"""
import argparse, os, sys, time, threading
from axoniz.core.config import load_config, save_config, AXONIZ_HOME, MODELS_DIR
from axoniz.core.debug import debug, warn, error
from axoniz.core.logger import get_logger, init_logger, LogConfig

VERSION = "1.0.0"

# Initialize logger early
_logger = get_logger()

def _c(code):
    if os.environ.get("NO_COLOR") or not (hasattr(sys.stdout,"isatty") and sys.stdout.isatty()):
        return ""
    return f"\033[{code}m"

R=_c("0"); B=_c("1"); DG=_c("90"); GR=_c("37"); BL=_c("94")
GB=_c("92"); YL=_c("93"); RD=_c("91"); WH=_c("97"); CY=_c("96")
PURPLE=_c("95")

class C:
    RESET=R; BOLD=B; GRAY=DG; DGRAY=DG; WHITE=WH; BLUE=BL
    GREEN=GB; YELLOW=YL; RED=RD; CYAN=CY; PURPLE=_c("95")
    R=R; DG=DG; GR=GR; BL=BL; GB=GB; YL=YL; RD=RD; WH=WH; CY=CY

def print_banner(model="", backend="", **_):
    print()
    print(f"  {PURPLE}{B}FRAZIYM AI{R}  {DG}v{VERSION}{R}")
    print(f"  {DG}local ai agent · {backend} · {model or 'auto'}{R}")
    print()

def kv(key, val):
    print(f"  {DG}{key:<18}{R}{GR}{val}{R}")

def section(title):
    print(f"\n  {DG}{title.upper()}{R}\n  {DG}{'-'*min(len(title)+4,60)}{R}")


class Runner:
    def __init__(self):
        self.cfg = load_config()

    def build_agent(self, overrides=None):
        from axoniz.core.config import load_config_with_autodetect
        cfg = load_config_with_autodetect()
        if overrides:
            cfg.update({k: v for k, v in overrides.items() if v is not None})
            # Sync model_name to filename if model_path is provided
            if "model_path" in overrides and overrides["model_path"]:
                cfg["model_name"] = os.path.basename(overrides["model_path"])
        
        # Default to llamacpp only if no provider is configured at all
        active_provider = (
            cfg.get("provider")
            or cfg.get("backend")
            or cfg.get("llm", {}).get("active_provider")
        )
        if not active_provider:
            cfg["provider"] = "llamacpp"
            cfg["backend"]  = "llamacpp"
            
        from axoniz.core.agent import Agent
        return Agent(**cfg)

    def check_backend(self, agent) -> bool:
        h = agent.health()
        if h.get("status") == "ok":
            return True
        return True


def _start_web(agent, port):
    from axoniz.web.server import WebServer
    ws = WebServer(agent=agent, port=port)
    t  = threading.Thread(target=ws.start, kwargs={"open_browser": True}, daemon=True)
    t.start()
    time.sleep(0.8)
    url = f"http://localhost:{port}"
    print(f"  {CY}web →{R} {BL}{url}{R}")
    return url


def _make_parser():
    p = argparse.ArgumentParser(prog="axoniz", add_help=False)
    p.add_argument("positional", nargs="*")
    p.add_argument("--lc",    action="store_true")
    p.add_argument("--cli",   action="store_true")
    p.add_argument("--web","-w", action="store_true")
    p.add_argument("--goal",  type=str, default=None)
    p.add_argument("--pipe",  action="store_true")
    p.add_argument("--provider", type=str, default=None, choices=["llamacpp","llamacpp_server","lmstudio","ollama","openai"],
                   help="Backend provider (llamacpp, llamacpp_server, lmstudio, ollama, openai)")
    p.add_argument("--model",      dest="model_name",   type=str, default=None)
    p.add_argument("--model-path", dest="model_path",   type=str, default=None)
    p.add_argument("--url",        dest="base_url",     type=str, default=None)
    p.add_argument("--gpu-layers", dest="n_gpu_layers", type=int, default=None)
    p.add_argument("--steps",   dest="max_steps",   type=int,   default=None)
    p.add_argument("--temp",    dest="temperature", type=float, default=None)
    p.add_argument("--tokens",  dest="max_tokens",  type=int,   default=None)
    p.add_argument("--ctx",     dest="n_ctx",       type=int,   default=None)
    p.add_argument("--workspace", dest="workspace", type=str, default=None)
    p.add_argument("--port",      type=int, default=7860)
    p.add_argument("--help","-h", action="store_true")
    p.add_argument("--version",   action="store_true")
    return p


def _overrides(args):
    ov = {}
    for k in ["model_name","model_path","base_url",
              "max_steps","temperature","max_tokens","n_ctx","workspace","n_gpu_layers"]:
        v = getattr(args, k, None)
        if v is not None: ov[k] = v
    # Only override provider if explicitly set on CLI
    if args.provider:
        ov["provider"] = args.provider
        ov["backend"]  = args.provider
    return ov


HELP = f"""
  {WH}{B}AXONIZ-ZERO{R}  {DG}v{VERSION}  — local AI agent{R}

  {B}MODES{R}
    {BL}--web{R}           Launch web UI at localhost:7860
    {BL}--lc{R}            Interactive REPL
    {BL}--cli{R}           One-shot task then exit
    {BL}--goal "..."{R}    Autonomous goal mode
    {BL}--pipe{R}          Read task from stdin

  {B}BACKEND{R}
    {BL}--provider <p>{R}   Backend: llamacpp, llamacpp_server, lmstudio, ollama, openai
    {BL}--model-path <p>{R}  Path to .gguf model (llamacpp only)
    {BL}--url <url>{R}       Base URL for server backends
    {BL}--gpu-layers <n>{R}  GPU layers (llamacpp only)
    {BL}--ctx <n>{R}         Context window (llamacpp, default 32768)
    {BL}--temp 0.2{R}       Temperature
    {BL}--tokens 4096{R}    Max output tokens

  {B}SUBCOMMANDS{R}
    {BL}axoniz config show{R}     Show config
    {BL}axoniz config set k=v{R}  Set config value
    {BL}axoniz model list{R}      List models
    {BL}axoniz model use <n>{R}   Switch model
    {BL}axoniz memory{R}          Show memory
    {BL}axoniz palace{R}          Show palace status
    {BL}axoniz health{R}          System health report
"""


def _interactive_model_select():
    from axoniz.core.config import MODELS_DIR
    import glob
    
    print(f"\n  {WH}{B}SOVEREIGN VAULT SCAN{R}")
    print(f"  {DG}Scanning for GGUF models in {MODELS_DIR}...{R}\n")
    
    found = []
    if os.path.exists(MODELS_DIR):
        found = glob.glob(os.path.join(MODELS_DIR, "**", "*.gguf"), recursive=True)
    
    if not found:
        print(f"  {RD}[-] No GGUF models found in vault.{R}")
        print(f"  {DG}HINT: Place models in {MODELS_DIR} or use 'axoniz model download'{R}\n")
        return None
        
    for i, path in enumerate(found):
        name = os.path.basename(path)
        size_gb = os.path.getsize(path) / (1024**3)
        print(f"  {BL}[{i+1}]{R}  {WH}{name:<40}{R}  {DG}{size_gb:.1f} GB{R}")
        
    print(f"\n  {DG}Enter number to select or path to a different GGUF:{R}")
    try:
        # Check if stdin is a TTY before asking
        if not sys.stdin.isatty(): return None
        
        choice = input(f"  {CY}Selection: {R}").strip()

        if not choice: return None
        
        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(found):
                return found[idx]
        
        if os.path.exists(choice):
            return os.path.abspath(choice)
            
        print(f"  {RD}[-] Invalid selection.{R}")
        return None
    except (EOFError, KeyboardInterrupt):
        return None


def main():
    p    = _make_parser()
    args = p.parse_args()
    pos  = args.positional

    if args.version:
        print(f"axoniz-zero {VERSION}"); return
    if args.help:
        print(HELP); return

    runner = Runner()
    cfg    = runner.cfg
    ov     = _overrides(args)
    
    logger = get_logger()
    logger.info(f"CLI started | version={VERSION} | args={vars(args)}")
    logger.log_event("cli_start", {"version": VERSION, "args": {k: v for k, v in vars(args).items() if k not in ("api_key", "token", "password")}})

    # ── Sovereign Selection ──────────────────────────────────────────────────
    # If using interactive CLI or goal mode but no model is configured/passed, ask.
    # Only require GGUF selection for direct llamacpp backends.
    active_provider = (
        ov.get("provider")
        or cfg.get("provider")
        or cfg.get("backend")
        or cfg.get("llm", {}).get("active_provider")
        or "llamacpp"
    )
    is_local_gguf = active_provider in ("llamacpp", "gguf")
    if (args.lc or args.goal or args.cli) and is_local_gguf and not ov.get("model_path") and not cfg.get("model_path"):
        selected = _interactive_model_select()
        if selected:
            ov["model_path"] = selected
            logger.info(f"User selected model: {selected}")
            print(f"  {GB}[+] {DG}Using model: {os.path.basename(selected)}{R}\n")
        else:
            if not args.pipe:
                logger.error("No model selected for local GGUF backend")
                print(f"  {RD}[-] Model required for {active_provider}.{R}\n")
                sys.exit(1)

    # ── Subcommands ───────────────────────────────────────────────────────────
    if pos:
        cmd = pos[0].lower()

        if cmd in ("model","models"):
            from axoniz.core.models import show_table, get as gm
            action = pos[1].lower() if len(pos)>1 else "list"
            name   = pos[2] if len(pos)>2 else None
            if action in ("list","ls","all"):
                show_table()
            elif action == "download" and name:
                # Expecting repo_id filename
                filename = pos[3] if len(pos)>3 else None
                from axoniz.core.downloader import download_model
                download_model(name, filename)
            elif action == "use" and name:
                m = gm(name)
                if m:
                    cfg["model_name"]=m.name; cfg["temperature"]=m.temperature
                    cfg["max_tokens"]=m.max_tokens; save_config(cfg)
                    logger.info(f"Model switched to {m.name}")
                    print(f"  {GB}[+] Switched to {m.name}{R}")
                else:
                    cfg["model_name"]=name; save_config(cfg)
                    logger.info(f"Model set to {name}")
                    print(f"  {GB}[+] Model set to '{name}'{R}")
            return

        if cmd == "config":
            action = pos[1].lower() if len(pos)>1 else "show"
            if action == "show":
                from axoniz.core.config import show_config; show_config()
            elif action == "set" and len(pos)>2:
                for pair in pos[2:]:
                    if "=" in pair:
                        k,v = pair.split("=",1)
                        try: v=int(v)
                        except ValueError:
                            try: v=float(v)
                            except ValueError: pass
                        old = cfg.get(k.strip())
                        cfg[k.strip()]=v; save_config(cfg)
                        logger.log_config_change(k.strip(), old, v)
                        print(f"  {GB}[+] {DG}{k} = {v}{R}")
            elif action == "reset":
                from axoniz.core.config import reset_config; reset_config()
                logger.info("Config reset to defaults")
            return

        if cmd == "setup":
            from axoniz.core.first_run import run_setup; run_setup(); return

        if cmd in ("memory","mem"):
            agent = runner.build_agent(ov)
            mem   = agent.memory.all()
            if mem:
                section("semantic memory")
                for k,v in list(mem.items())[:20]: kv(k, str(v)[:72])
            else:
                print(f"  {DG}(empty){R}")
            return

        if cmd == "palace":
            agent = runner.build_agent(ov)
            st    = agent.memory.palace.status()
            print(f"\n  {DG}palace: {st.get('total_drawers',0)} drawers{R}")
            for w,c in list(st.get("wings",{}).items())[:10]:
                print(f"    {DG}{w:<30}{R}{GR}{c} drawers{R}")
            return

        if cmd not in ("run","web","config","memory","mem","setup","model","models","palace"):
            pass  # fall through — treat as inline task

    # ── No args → help ────────────────────────────────────────────────────────
    if not pos and not any([args.lc, args.cli, args.web, args.goal, args.pipe]):
        print(HELP); return

    # ── Build agent ───────────────────────────────────────────────────────────
    model     = ov.get("model_name", cfg.get("model_name",""))
    workspace = ov.get("workspace", cfg.get("workspace","."))

    print(f"\n  {PURPLE}{B}FRAZIYM AI{R}  {DG}v{VERSION}{R}")
    prov_str = ov.get("provider", cfg.get("provider", cfg.get("backend", cfg.get("llm", {}).get("active_provider", "llamacpp"))))
    print(f"  {DG}backend{R}      {GR}{prov_str}{R}")
    print(f"  {DG}eye{R}          {GR}axodex graph active{R}")
    print(f"  {DG}swarm{R}        {GR}swarm engine ready{R}")
    print(f"  {DG}workspace{R}    {GR}{os.path.abspath(workspace)}{R}\n")
    
    logger.info(f"Building agent | provider={prov_str} | workspace={workspace}")

    try:
        agent = runner.build_agent(ov)
        logger.log_agent_init({"provider": prov_str, "workspace": workspace, "model": model})
    except Exception as e:
        logger.log_agent_error(e, "build_agent")
        print(f"\n  {RD}✗ Failed to start: {e}{R}\n")
        import traceback; traceback.print_exc()
        sys.exit(1)

    if not runner.check_backend(agent):
        logger.error("Backend health check failed")
        sys.exit(1)

    h        = agent.health()
    prov_str = agent.config.get("provider", agent.config.get("backend","llamacpp"))
    
    # Priority: 1. Health check model name (the truth), 2. Config model_name, 3. auto
    mdl_str  = h.get("model") or agent.config.get("model_name") or "auto"
        
    dot      = f"{GB}[*]{R}" if h.get("status")=="ok" else f"{YL}[!]{R}"
    print(f"  {dot}  {DG}{prov_str}{R}  {DG}/{R}  {GR}{mdl_str}{R}\n")
    logger.log_backend_health(prov_str, h)

    # ── Web-only ──────────────────────────────────────────────────────────────
    if args.web and not args.lc and not args.cli and not args.goal:
        try:
            from axoniz.startup import full_boot
            full_boot(
                cfg       = None,          # startup re-reads config fresh
                overrides = ov or None,
                port      = args.port,
                open_browser = True,
                web       = True,          # blocks here
            )
        except KeyboardInterrupt:
            logger.info("Web server stopped by user")
            print(f"\n  {DG}stopped.{R}")
        finally:
            logger.log_session_end("web_stop")
        return

    from axoniz.core.cli import CLI
    web_url = _start_web(agent, args.port) if args.web else None
    cli = CLI(agent, web_url=web_url)

    # Pipe
    if args.pipe or (not sys.stdin.isatty() and not args.lc):
        task = sys.stdin.read().strip()
        if task:
            logger.log_agent_run(task, "pipe")
            cli._run_agent(task)
        logger.log_session_end("pipe_done")
        return

    # Positional inline task
    task = None
    if pos:
        skip = {"run","web","config","memory","mem","setup","model","models","backends","palace"}
        if pos[0].lower() not in skip:
            task = " ".join(pos).strip()
        elif pos[0].lower()=="run" and len(pos)>1:
            task = " ".join(pos[1:]).strip()
    if task:
        logger.log_agent_run(task, "inline")
        cli._run_agent(task)
        logger.log_session_end("inline_done")
        return

    if args.goal:
        logger.log_agent_run(args.goal, "goal")
        cli._run_goal(args.goal)
        logger.log_session_end("goal_done")
        return

    if args.cli:
        if sys.stdin.isatty():
            try: task = input(f"  {DG}Task: {R}").strip()
            except EOFError: return
        else:
            task = sys.stdin.read().strip()
        if task:
            logger.log_agent_run(task, "cli")
            cli._run_agent(task)
        logger.log_session_end("cli_done")
        return

    # Interactive REPL
    logger.log_agent_run("", "repl")
    try:
        cli.run()
    except KeyboardInterrupt:
        pass
    finally:
        logger.log_session_end("repl_stop")


if __name__ == "__main__":
    main()
