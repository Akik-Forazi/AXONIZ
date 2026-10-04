"""
AXONIZ-ZERO — CLI (clean, no BERU)
"""
import sys, os, re, time, shutil, threading, textwrap, json
from typing import Optional, Dict

def _tty(): return hasattr(sys.stdout,"isatty") and sys.stdout.isatty()
def _color_ok():
    if os.environ.get("NO_COLOR"): return False
    return _tty() or bool(os.environ.get("FORCE_COLOR"))

HAS_COLOR = _color_ok()
TW = shutil.get_terminal_size((100,40)).columns

def _e(code): return f"\033[{code}m" if HAS_COLOR else ""

class C:
    R=_e("0"); B=_e("1"); D=_e("2")
    W=_e("97"); GR=_e("37"); DG=_e("90")
    BL=_e("94"); GB=_e("92"); YL=_e("93")
    RD=_e("91"); PU=_e("35"); CY=_e("96")
    AC=_e("94"); OK=_e("92"); ER=_e("91"); WN=_e("93")
    TH=_e("90"); TC=_e("96"); TR=_e("92")
    # compat aliases used by runner.py
    RESET=_e("0"); BOLD=_e("1"); GRAY=_e("90"); DGRAY=_e("90")
    WHITE=_e("97"); BLUE=_e("94"); GREEN=_e("92"); YELLOW=_e("93")
    RED=_e("91"); CYAN=_e("96"); PURPLE=_e("35")

def print_banner(model="", backend="", **_):
    print(f"\n  {C.W}{C.B}AXONIZ-ZERO{C.R}  {C.DG}local ai agent · {backend} · {model or 'auto'}{C.R}\n")

def kv(key, val):
    print(f"  {C.DG}{key:<18}{C.R}{C.GR}{val}{C.R}")

def section(title):
    print(f"\n  {C.DG}{title.upper()}{C.R}\n  {C.DG}{'-'*min(len(title)+4,60)}{C.R}")

def ok(msg):  print(f"  {C.OK}[+]{C.R}  {C.DG}{msg}{C.R}")
def err(msg): print(f"  {C.ER}[-]{C.R}  {C.GR}{msg}{C.R}")

def _inline(text):
    text = re.sub(r'\*\*(.*?)\*\*', f"{C.W}\\1{C.R}{C.GR}", text)
    text = re.sub(r'\*(.*?)\*',     f"{C.D}\\1{C.R}{C.GR}", text)
    text = re.sub(r'`([^`\n]+)`',   f"{C.PU}\\1{C.R}{C.GR}", text)
    return text

def print_response(text, prefix="  "):
    if not text: return
    print()
    lines = text.split("\n")
    in_code = False; code_buf = []; code_lang = ""
    for line in lines:
        if line.startswith("```"):
            if not in_code:
                in_code = True; code_lang = line[3:].strip(); code_buf = []
            else:
                in_code = False
                w = min(TW-8, 72)
                lbl = (code_lang or "code").upper()
                bar = "-" * max(0, w-len(lbl)-3)
                print(f"\n  {C.DG}+- {lbl} {bar}+{C.R}")
                for cl in code_buf:
                    print(f"  {C.DG}|{C.R} {C.GR}{cl}{C.R}")
                print(f"  {C.DG}+{'-'*(w+2)}+{C.R}\n")
                code_buf = []
        elif in_code:
            code_buf.append(line)
        else:
            s = line.rstrip()
            if s.startswith("### "): print(f"{prefix}{C.W}{C.B}{s[4:]}{C.R}")
            elif s.startswith("## "): print(f"{prefix}{C.W}{C.B}{s[3:]}{C.R}")
            elif s.startswith("# "): print(f"\n{prefix}{C.W}{C.B}  {s[2:]}  {C.R}\n")
            elif re.match(r'^(\s*)[-*] ', s):
                body = s.lstrip("-* ").strip()
                print(f"{prefix}{C.DG}- {C.R}{C.GR}{_inline(body)}{C.R}")
            elif re.match(r'^\s*\d+\. ', s):
                m = re.match(r'^(\s*)(\d+)\. (.*)', s)
                if m: print(f"{prefix}{m.group(1)}{C.DG}{m.group(2)}.{C.R} {C.GR}{_inline(m.group(3))}{C.R}")
            elif re.match(r'^---+$', s):
                print(f"{prefix}{C.DG}{'-'*min(TW-6,60)}{C.R}")
            elif s.startswith("> "):
                print(f"{prefix}{C.DG}|{C.R} {C.D}{_inline(s[2:])}{C.R}")
            elif s:
                for wl in textwrap.wrap(_inline(s), width=min(TW-6,90), subsequent_indent="  "):
                    print(f"{prefix}{C.GR}{wl}{C.R}")
            else:
                print()

def _rule():
    print(f"  {C.DG}{'-'*min(TW-4,72)}{C.R}")

rule = _rule

class Spinner:
    def __init__(self, text="working...", delay=0.1):
        self.text = text
        self.delay = delay
        self.busy = False
        self._thread = None
        self.chars = ["|", "/", "-", "\\"]

    def _spin(self):
        while self.busy:
            for char in self.chars:
                if not self.busy: break
                sys.stdout.write(f"\r  {C.DG}{char} {self.text}{C.R}")
                sys.stdout.flush()
                time.sleep(self.delay)

    def start(self):
        if not _tty(): return
        self.busy = True
        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()

    def stop(self):
        if not self.busy: return
        self.busy = False
        if self._thread:
            self._thread.join(timeout=0.5)
        sys.stdout.write("\r" + " "*(len(self.text)+10) + "\r")
        sys.stdout.flush()


SLASH_HELP = {
    "/help":    "show this help",
    "/mode":    "/mode [agent|chat|goal] — switch mode",
    "/memory":  "show semantic memory",
    "/palace":  "/palace [search <q> | wings | status]",
    "/clear":   "clear screen",
    "/reset":   "clear conversation history",
    "/config":  "show active config",
    "/health":  "system health report",
    "/metrics": "show prometheus metrics",
    "/tree":    "workspace file tree",
    "!<cmd>":   "run shell command",
}


class CLI:
    def __init__(self, agent, web_url=None):
        self.agent   = agent
        self.web_url = web_url
        self.mode    = "agent"
        self._abort  = threading.Event()
        self._tool_calls = 0
        self._tokens_out = 0
        self._start_time = time.time()

    def _prompt(self):
        cwd    = os.path.basename(os.path.abspath(self.agent.workspace))
        mode_c = {
            "agent": C.BL, "goal": C.PU, "chat": C.DG
        }.get(self.mode, C.DG)
        return (
            f"\n  {C.DG}/ {C.R}{C.GR}{cwd}{C.R}"
            f"  {C.DG}[{mode_c}{self.mode}{C.DG}]{C.R}\n"
            f"  {C.DG}\\ {C.R}"
        )

    # ── Run agent ─────────────────────────────────────────────────────────────

    def _run_agent(self, task: str):
        self._abort.clear()
        self.agent.set_abort_event(self._abort)

        def on_step(s, total):
            if _tty():
                sys.stdout.write(f"\r  {C.DG}step {s}/{total}…{C.R}   ")
                sys.stdout.flush()

        def on_thought(content):
            preview = content.strip().replace("\n"," ")[:100]
            if _tty():
                sys.stdout.write(f"\r{' '*min(TW,80)}\r")
                sys.stdout.flush()
            print(f"  {C.TH}*  {preview}{C.R}")

        def on_tool_call(name, args):
            if _tty():
                sys.stdout.write(f"\r{' '*min(TW,80)}\r")
                sys.stdout.flush()
            args_s = " ".join(f"{k}={str(v)[:30]}" for k,v in list(args.items())[:2])
            print(f"\n  {C.BL}o{C.R}  {C.TC}{name}{C.R}  {C.DG}{args_s}{C.R}")
            self._tool_calls += 1

        def on_tool_result(name, result):
            failed = str(result).startswith("[ERROR]")
            icon   = f"{C.ER}[-]{C.R}" if failed else f"{C.OK}[+]{C.R}"
            preview = str(result).strip().replace("\n"," ")[:110]
            if len(preview) > 110: preview = preview[:110]+"..."
            print(f"  {icon}  {C.TR}{preview}{C.R}")

        def on_token(tok):
            self._tokens_out += len(tok)

        self.agent.on_step        = on_step
        self.agent.on_thought     = on_thought
        self.agent.on_tool_call   = on_tool_call
        self.agent.on_tool_result = on_tool_result
        self.agent.on_token       = on_token
        self.agent.on_done        = None

        try:
            result = self.agent.run(task)
        except KeyboardInterrupt:
            self._abort.set()
            result = "[Stopped by user]"
        finally:
            if _tty():
                sys.stdout.write(f"\r{' '*min(TW,80)}\r")
                sys.stdout.flush()

        print(); _rule()
        print_response(result)
        _rule()
        elapsed = int(time.time()-self._start_time)
        print(f"  {C.DG}{self._tool_calls} tools  {self._tokens_out} tokens  {elapsed}s{C.R}")

    # ── Run chat ──────────────────────────────────────────────────────────────

    def _run_chat(self, message: str):
        self._abort.clear()
        self.agent.set_abort_event(self._abort)
        buf = []
        self.agent.on_token = lambda t: buf.append(t)
        try:
            self.agent.chat(message)
        except KeyboardInterrupt:
            self._abort.set()
        print(); _rule()
        print_response("".join(buf))
        _rule()

    # ── Run goal ──────────────────────────────────────────────────────────────

    def _run_goal(self, goal: str):
        print(f"\n  {C.PU}* {C.R}  {C.DG}goal mode - autonomous until complete{C.R}")
        print(f"  {C.DG}goal: {C.GR}{goal}{C.R}\n")
        from axoniz.core.loop import LoopEngine
        engine = LoopEngine(
            agent=self.agent,
            max_cycles=int(self.agent.config.get("max_cycles", 5)),
            max_retries=3,
            verbose=True,
        )
        result = engine.run_goal(goal)
        print()
        print(f"  {C.OK}* {C.R}  {C.GR}{result}{C.R}")

    # ── Slash commands ────────────────────────────────────────────────────────

    def _handle_slash(self, text) -> bool:
        parts = text.split(None, 2)
        cmd   = parts[0].lower()

        try:
            if cmd == "/help":
                print(f"\n  {C.DG}Slash commands:{C.R}")
                for c,d in SLASH_HELP.items():
                    print(f"  {C.BL}{c:<28}{C.R}{C.DG}{d}{C.R}")
                print(); return True

            if cmd == "/mode":
                new = parts[1].lower() if len(parts)>1 else None
                if new in ("agent","chat","goal"):
                    self.mode = new
                    print(f"  {C.DG}mode → {C.BL}{self.mode}{C.R}")
                else:
                    print(f"  {C.DG}current: {C.BL}{self.mode}{C.R}  options: agent chat goal")
                return True

            if cmd == "/memory":
                mem = self.agent.memory.all()
                if mem:
                    section("semantic memory")
                    for k,v in list(mem.items())[:20]: kv(k, str(v)[:72])
                else:
                    print(f"  {C.DG}(empty){C.R}")
                return True

            if cmd == "/palace":
                sub = parts[1].lower() if len(parts)>1 else "status"
                if sub == "search" and len(parts)>2:
                    r = self.agent.memory.palace.search(parts[2], limit=6)
                    hits = r.get("results",[])
                    if hits:
                        section(f"palace: {parts[2]}")
                        for h in hits:
                            print(f"  {C.DG}[{h['wing']}/{h['room']}]{C.R}  {C.GR}{h['text'][:150]}{C.R}")
                    else:
                        print(f"  {C.DG}no results{C.R}")
                elif sub == "wings":
                    wings = self.agent.memory.palace.list_wings().get("wings",{})
                    section("palace wings")
                    for w,c in wings.items(): kv(w, f"{c} drawers")
                else:
                    st = self.agent.memory.palace.status()
                    print(f"  {C.DG}palace: {st.get('total_drawers',0)} drawers{C.R}")
                    for w,c in list(st.get("wings",{}).items())[:8]:
                        print(f"    {C.DG}{w:<30}{C.R}{C.GR}{c}{C.R}")
                return True

            if cmd == "/clear":
                os.system("cls" if sys.platform=="win32" else "clear"); return True

            if cmd == "/reset":
                self.agent.reset(); ok("conversation reset"); return True

            if cmd == "/config":
                from axoniz.core.config import load_config
                cfg = load_config(); section("config")
                for k in ["provider","model_name","base_url","temperature","max_tokens","max_steps","workspace"]:
                    if k in cfg: kv(k, str(cfg[k]))
                return True

            if cmd == "/health":
                h    = self.agent.health()
                live = h.get("status")=="ok"
                dot  = C.OK if live else C.ER
                print(f"  {dot}[*]{C.R}  {C.DG}{h.get('backend','?')} / {h.get('model', self.agent.config.get('model_name','?'))}{C.R}")
                try:
                    ist = self.agent.integration_status()
                    kv("palace", f"{'[+]' if ist.get('palace_available') else '[-]'}  {ist.get('palace_drawers',0)} drawers")
                    kv("kg triples", str(ist.get("kg_stats",{}).get("total_triples",0)))
                except Exception:
                    pass
                return True

            if cmd == "/tree":
                result = self.agent.code_tools.tree(self.agent.workspace)
                print()
                for line in result.split("\n"):
                    print(f"  {C.DG}{line}{C.R}")
                return True
        except Exception as e:
            err(f"Error handling {cmd}: {e}")
            if os.environ.get("AXONIZ_DEBUG"):
                import traceback; traceback.print_exc()
            return True

        return False

    # ── Environment Check ─────────────────────────────────────────────────────

    def check_environment(self) -> bool:
        """Verify essential dependencies."""
        errors = []
        import subprocess
        try:
            subprocess.run(["node", "-v"], capture_output=True, check=True)
        except Exception:
            errors.append("node.js not found in PATH")
        
        if errors:
            print(f"  {C.ER}[!] Environment checks failed:{C.R}")
            for e in errors:
                print(f"    {C.GR}- {e}{C.R}")
            return False
        return True

    # ── REPL ──────────────────────────────────────────────────────────────────

    def run(self):
        if not self.check_environment():
            print(f"\n  {C.ER}Essential environment checks failed. Please fix before proceeding.{C.R}\n")
            return

        hint = f"  {C.DG}web -> {C.BL}{self.web_url}{C.R}" if self.web_url else ""
        print(f"  {C.DG}type /help | Ctrl-C stops | exit to quit{C.R}")
        if hint: print(hint)
        print()

        # Show last diary entry if available
        try:
            d = self.agent.memory._t_diary_read(last_n=1)
            if d and "No diary" not in d:
                first = [l for l in d.split("\n") if l.strip()][1:2]
                if first:
                    print(f"  {C.DG}Last session: {C.GR}{first[0].strip()[:80]}{C.R}\n")
        except Exception:
            pass

        while True:
            try:
                text = input(self._prompt()).strip()
                sys.stdout.write(C.R); sys.stdout.flush()
            except EOFError:
                break
            except KeyboardInterrupt:
                print(f"\n  {C.DG}(Ctrl-C — type exit to quit){C.R}")
                continue

            if not text: continue
            low = text.lower().strip()

            if low in ("exit","quit","q",":q"):
                print(f"\n  {C.DG}bye.{C.R}\n"); break

            if text.startswith("!"):
                try:
                    out = self.agent.shell_tools.run(text[1:].strip())
                    print()
                    for line in out.split("\n"):
                        print(f"  {C.DG}{line}{C.R}")
                except Exception as e:
                    err(str(e))
                continue

            if text.startswith("/"):
                try:
                    if not self._handle_slash(text):
                        err(f"unknown command: {text.split()[0]}  (try /help)")
                except KeyboardInterrupt:
                    print(f"\n  {C.DG}interrupted{C.R}")
                except Exception as e:
                    err(str(e))
                continue

            if low in ("agent","chat","goal"):
                self.mode = low
                print(f"  {C.DG}mode → {C.BL}{self.mode}{C.R}")
                continue

            try:
                if self.mode == "goal":
                    self._run_goal(text)
                elif self.mode == "chat":
                    self._run_chat(text)
                else:
                    self._run_agent(text)
            except KeyboardInterrupt:
                self._abort.set()
                print(f"\n  {C.DG}stopped.{C.R}")
            except Exception as e:
                err(str(e))
                if os.environ.get("AXONIZ_DEBUG"):
                    import traceback; traceback.print_exc()
