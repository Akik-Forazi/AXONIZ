import json
import threading
import urllib.request
import webbrowser
import time
import os
import traceback
import mimetypes
import glob
import sys
import uuid
import queue
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from axoniz.core.agent import Agent
from axoniz.core.config import (
    load_config, save_config, AXONIZ_HOME, MODELS_DIR, model_dir
)
from axoniz.core.auth import LocalAuth
from axoniz.core.metrics import track_request, get_metrics
from axoniz.core.rate_limit import get_rate_limiter

# Global instances
_auth = LocalAuth()
_limiter = get_rate_limiter()

# Global abort registry — maps thread_id -> threading.Event
_abort_events: dict = {}
_abort_lock = threading.Lock()

def _register_abort(tid: int) -> threading.Event:
    ev = threading.Event()
    with _abort_lock:
        _abort_events[tid] = ev
    return ev

def _unregister_abort(tid: int):
    with _abort_lock:
        _abort_events.pop(tid, None)

def get_model_search_dirs():
    dirs = [
        MODELS_DIR,
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"),
        os.path.expanduser("~/Downloads"),
        os.path.expanduser("~/models"),
        r"C:\Users\akikf\.axoniz\models\lmstudio-community",
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ]
    unique_dirs = []
    for d in dirs:
        if d:
            p = os.path.abspath(os.path.normpath(d))
            if p not in unique_dirs:
                unique_dirs.append(p)
    return unique_dirs

class SSEBroker:
    def __init__(self):
        self.queues = []
        self._lock = threading.Lock()

    def add_client(self) -> queue.Queue:
        q = queue.Queue()
        with self._lock:
            self.queues.append(q)
        return q

    def remove_client(self, q: queue.Queue):
        with self._lock:
            if q in self.queues:
                self.queues.remove(q)

    def broadcast(self, event_type: str, data: dict):
        event_data = {
            "type": event_type,
            "timestamp": int(time.time() * 1000),
            **data
        }
        with self._lock:
            for q in self.queues:
                q.put(event_data)

_broker = SSEBroker()

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

def get_static_file(path: str):
    if path == "/" or not path:
        path = "index.html"
    path = path.lstrip("/")
    if path.startswith("static/"):
        path = path[7:]
    full_path = os.path.normpath(os.path.join(STATIC_DIR, path))
    if not full_path.startswith(os.path.normpath(STATIC_DIR)):
        return None, None
    if not os.path.isfile(full_path):
        return None, None
    mime, _ = mimetypes.guess_type(full_path)
    try:
        with open(full_path, "rb") as f:
            return f.read(), mime or "application/octet-stream"
    except Exception:
        return None, None

class _QuietServer(ThreadingHTTPServer):
    daemon_threads = True
    def handle_error(self, request, client_address):
        exc = __import__("sys").exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError)):
            return
        print(f"[Server] {client_address}: {exc}")

class _Stats:
    def __init__(self):
        self.requests       = 0
        self.chat_turns     = 0
        self.agent_runs     = 0
        self.goal_runs      = 0
        self.tool_calls     = 0
        self.model_switches = 0
        self.start_time     = time.time()
        self._lock          = threading.Lock()

    def inc(self, field: str, n: int = 1):
        with self._lock:
            setattr(self, field, getattr(self, field, 0) + n)

    def snapshot(self) -> dict:
        with self._lock:
            uptime = int(time.time() - self.start_time)
            return {
                "uptime_seconds": uptime,
                "requests":       self.requests,
                "chat_turns":     self.chat_turns,
                "agent_runs":     self.agent_runs,
                "goal_runs":      self.goal_runs,
                "tool_calls":     self.tool_calls,
                "model_switches": self.model_switches,
            }

_stats = _Stats()

class axonizHandler(BaseHTTPRequestHandler):
    agent: Agent = None

    def log_message(self, *_): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Credentials", "true")

    def _authenticate(self) -> bool:
        """Verify JWT token from Authorization header. Returns True if valid or if auth is disabled."""
        auth_header = self.headers.get("Authorization")
        if not auth_header:
            # For local use, we might allow no auth if not configured, 
            # but here we'll check if a users.json exists.
            users_file = _auth.secret_file.parent / "users.json"
            if not users_file.exists():
                return True # No users defined, allow access
            return False
            
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            user = _auth.verify_token(token)
            return user is not None
        return False

    def _json(self, data, status=200):
        try:
            body = json.dumps(data, default=str).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            self.wfile.flush()
        except Exception: pass

    def _body(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(n)) if n else {}
        except Exception: return {}

    def _sse_open(self) -> bool:
        try:
            self.send_response(200)
            self.send_header("Content-Type",    "text/event-stream")
            self.send_header("Cache-Control",   "no-cache")
            self.send_header("X-Accel-Buffering","no")
            self._cors()
            self.end_headers()
            self.wfile.flush()
            return True
        except Exception: return False

    def _sse(self, ev: dict) -> bool:
        try:
            self.wfile.write(f"data: {json.dumps(ev, default=str)}\n\n".encode())
            self.wfile.flush()
            return True
        except Exception: return False

    def do_OPTIONS(self):
        try:
            self.send_response(204)
            self._cors()
            self.end_headers()
        except Exception: pass

    def do_GET(self):
        t0 = time.time()
        _stats.inc("requests")
        parsed = urlparse(self.path)
        path = parsed.path
        
        # Rate limit check (exclude static files)
        if path.startswith("/api/"):
            client_ip = self.client_address[0]
            if not _limiter.is_allowed(client_ip):
                return self._json({"error": "Rate limit exceeded"}, 429)
                
            # Auth check for sensitive endpoints
            if not self._authenticate() and path not in ("/api/health", "/api/auth/login"):
                # We don't block yet to avoid breaking local UI, but we log it
                pass

        try:
            self._get(path, parsed)
            status = "200"
        except Exception as e:
            self._json({"error": str(e)}, 500)
            status = "500"
        
        duration = time.time() - t0
        track_request(path, status, duration)

    def _get(self, path: str, parsed):
        if path == "/metrics":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
            self._cors(); self.end_headers()
            self.wfile.write(get_metrics())
            return
            
        # ── Voice endpoints ───────────────────────────────────────────────────
        if path.startswith("/api/voice/tts"):
            qs = parse_qs(parsed.query)
            text = qs.get("text", [""])[0].strip()
            if not text:
                return self._json({"error": "No text provided"}, 400)
            
            try:
                from axoniz.voice.tts import TTSEngine
                # Instantiate engine (loads Kokoro/MMS based on availability)
                engine = TTSEngine(provider="auto")
                audio_bytes = engine.synthesize_to_bytes(text)
                
                if not audio_bytes:
                    return self._json({"error": "TTS synthesis failed"}, 500)
                
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(audio_bytes)))
                self._cors()
                self.end_headers()
                self.wfile.write(audio_bytes)
                self.wfile.flush()
                return
            except Exception as e:
                return self._json({"error": str(e)}, 500)
                
        if path == "/api/voice/stt":
            return self._json({"error": "Use POST for STT"}, 405)
            
        # ── Fallback to frontend static files ─────────────────────────────────

        if not path.startswith("/api/"):
            content, mime = get_static_file(path)
            if content:
                try:
                    # Force correct mime types for web assets to prevent UI breakage
                    if path.endswith(".css"):
                        mime = "text/css"
                    elif path.endswith(".js"):
                        mime = "application/javascript"
                    
                    self.send_response(200)
                    self.send_header("Content-Type",   mime)
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Cache-Control", "no-cache" if path.endswith(".html") or path == "/" else "max-age=3600")
                    self._cors(); self.end_headers()
                    self.wfile.write(content); self.wfile.flush()
                except Exception: pass
                return
            if "." not in path:
                content, mime = get_static_file("index.html")
                if content:
                    try:
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html; charset=utf-8")
                        self._cors(); self.end_headers()
                        self.wfile.write(content); self.wfile.flush()
                    except Exception: pass
                    return

        # Removed Odysseus bridge endpoints

        if path == "/api/models/search":
            query = parse_qs(urlparse(self.path).query).get("q", ["gguf"])[0]
            from axoniz.core.downloader import search_models
            return self._json(search_models(query))

        if path == "/api/models/downloads":
            from axoniz.core.downloader import get_download_status
            return self._json(get_download_status())

        if path == "/api/war_room":
            if not self.agent: return self._json({"error": "No agent"})
            return self._json({"status": self.agent._tool_war_room()})
            
        if path == "/api/absolute_query":
            if not self.agent: return self._json({"error": "No agent"})
            query = parse_qs(urlparse(self.path).query).get("q", [""])[0]
            return self._json({"result": self.agent._tool_absolute_query(query)})

        if path == "/api/stream":
            if not self._sse_open():
                return
            q = _broker.add_client()
            try:
                while True:
                    try:
                        event_data = q.get(timeout=1.0)
                        self.wfile.write(f"data: {json.dumps(event_data, default=str)}\n\n".encode())
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except (ConnectionError, BrokenPipeError, IOError):
                pass
            finally:
                _broker.remove_client(q)
            return

        if path == "/api/health":
            if not self.agent: return self._json({"status": "inactive"})
            h = self.agent.health()
            try:
                mem_st = self.agent.memory.palace.status()
                h["memory"] = {
                    "palace": self.agent.memory.palace.is_available(),
                    "drawers": mem_st.get("total_drawers", 0),
                    "kg": self.agent.memory.kg.stats(),
                }
            except Exception: pass
            return self._json(h)

        if path == "/api/config":
            from axoniz.core.config import load_config_with_autodetect
            cfg = load_config_with_autodetect()
            cfg["_home"] = AXONIZ_HOME
            cfg["_models_dir"] = MODELS_DIR
            return self._json(cfg)

        if path == "/api/models":
            # Present GGUF models
            search_dirs = get_model_search_dirs()
            found = []
            for d in search_dirs:
                if os.path.exists(d):
                    for f in glob.glob(os.path.join(d, "**", "*.gguf"), recursive=True):
                        found.append(os.path.basename(f))
            return self._json({
                "items": [{
                    "endpoint_id": "axoniz-endpoint",
                    "models": sorted(list(set(found)))
                }]
            })

        if path == "/api/backends":
            from axoniz.core.backend import list_supported_providers
            return self._json(list_supported_providers())

        if path == "/api/memory":
            return self._json(self.agent.memory.all() if self.agent else {})

        if path == "/api/stats":
            return self._json(_stats.snapshot())

        if path == "/api/system/stats":
            from axoniz.core.metrics import get_system_telemetry
            return self._json(get_system_telemetry())

        if path == "/api/files/list":
            if not self.agent: return self._json({"error": "No agent"}, 500)
            tree = self.agent.code_tools.tree(".", max_depth=3)
            return self._json({"tree": tree})

        if path == "/api/swarm/status":
            from axoniz.core.config import load_config, resolve_swarm_models
            cfg = load_config()
            resolve_swarm_models(cfg)
            swarm = cfg.get("swarm_models", {})
            # Build a clean status payload: show basename + whether the file exists
            status = {}
            for role, fpath in swarm.items():
                import os as _os
                status[role] = {
                    "path":    fpath,
                    "name":    _os.path.basename(fpath) if fpath else "",
                    "ready":   bool(fpath and _os.path.exists(fpath)),
                }
            expert_mode = any(v["ready"] for v in status.values())
            return self._json({
                "expert_mode":  expert_mode,
                "roles":        status,
                "description":  (
                    "Domain-expert swarm active — models hot-swap per phase"
                    if expert_mode else
                    "Standard swarm mode — single model for all phases"
                ),
            })

        return self._json({"error": "Not found"}, 404)

    def do_POST(self):
        t0 = time.time()
        _stats.inc("requests")
        path = urlparse(self.path).path
        
        # Rate limit check
        client_ip = self.client_address[0]
        if not _limiter.is_allowed(client_ip):
            return self._json({"error": "Rate limit exceeded"}, 429)

        # Auth check
        if not self._authenticate() and path != "/api/auth/login":
            # Optional: block sensitive POSTs
            # return self._json({"error": "Unauthorized"}, 401)
            pass

        try:
            self._post(path)
            status = "200"
        except Exception as e:
            self._json({"error": str(e), "trace": traceback.format_exc()}, 500)
            status = "500"
            
        duration = time.time() - t0
        track_request(path, status, duration)

    def _post(self, path: str):
        ctype = self.headers.get("content-type", "")
        body = {}
        if not ctype.startswith("multipart/form-data"):
            body = self._body()

        if path == "/api/auth/login":
            user = body.get("username")
            pw = body.get("password")
            if _auth.verify_password(user, pw):
                token = _auth.create_token(user)
                return self._json({"token": token, "username": user})
            return self._json({"error": "Invalid credentials"}, 401)
            
        if path == "/api/voice/stt":
            import cgi
            import tempfile
            from axoniz.voice.stt import STTEngine
            
            # Parse multipart form data
            ctype, pdict = cgi.parse_header(self.headers.get("content-type"))
            if ctype == "multipart/form-data":
                pdict["boundary"] = bytes(pdict["boundary"], "utf-8")
                fields = cgi.parse_multipart(self.rfile, pdict)
                audio_data = fields.get("audio", [b""])[0]
                
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
                    tmp = f.name
                    f.write(audio_data)
                
                try:
                    engine = STTEngine()
                    text = engine.transcribe(tmp)
                    if text:
                        return self._json({"text": text})
                    return self._json({"error": "Transcription failed"}, 500)
                finally:
                    try: os.unlink(tmp)
                    except: pass
            return self._json({"error": "Invalid STT request format"}, 400)

        # Removed Odysseus settings POST endpoint

        if path == "/api/models/download":
            repo_id = body.get("repo_id")
            filename = body.get("filename")
            if not repo_id or not filename:
                return self._json({"error": "Missing repo_id or filename"}, 400)
            from axoniz.core.downloader import download_model_async
            res = download_model_async(repo_id, filename)
            return self._json({"message": res})

        if path == "/api/agent/task":
            conversation_id = body.get("conversationId", "default")
            user_id = body.get("userId", "default")
            intent = (body.get("intent") or body.get("message") or "").strip()
            modality = body.get("modality", "text")
            
            if not intent:
                return self._json({"error": "Missing intent"}, 400)
                
            task_id = f"task_{uuid.uuid4().hex[:8]}"
            
            # Start background thread to run the agent
            threading.Thread(
                target=self._run_agent_task_bg,
                args=(task_id, intent, conversation_id, user_id, modality),
                daemon=True
            ).start()
            
            return self._json({"taskId": task_id, "status": "started"})

        if path == "/api/chat":
            message = (body.get("message") or body.get("content") or "").strip()
            mode    = body.get("mode", "chat")
            if not message or not self.agent: return self._json({"error": "Bad request"}, 400)
            if not self._sse_open(): return
            tid = threading.get_ident()
            abort_ev = _register_abort(tid)
            try:
                if mode == "agent": self._agent_sse(message, abort_ev)
                else: self._chat_sse(message, abort_ev)
            finally:
                _unregister_abort(tid)
                try: self.wfile.write(b"data: [CLOSE]\n\n"); self.wfile.flush()
                except Exception: pass
            return

        if path == "/api/config/save":
            from axoniz.core.config import load_config, save_config, deep_merge
            cfg = load_config()
            deep_merge(cfg, body)
            save_config(cfg)
            if self.agent:
                self.agent.config = cfg
                self.agent._rebuild_llm()
            return self._json({"status": "saved"})

        if path == "/api/providers/test":
            from axoniz.core.backend import get_backend
            provider = body.get("provider", "openai")
            test_cfg = {
                "llm": {
                    "active_provider": provider,
                    "providers": {
                        provider: body.get("config", {})
                    }
                }
            }
            try:
                b = get_backend(test_cfg)
                h = b.health_check()
                return self._json(h)
            except Exception as e:
                return self._json({"status": "error", "error": str(e)})

        if path == "/api/model/switch":
            model_name  = body.get("path", "").strip()
            if not model_name:
                return self._json({"ok": False, "msg": "No model name provided"})
            from axoniz.core.config import load_config, save_config
            cfg         = load_config()
            search_dirs = get_model_search_dirs()
            full_path   = None
            if os.path.exists(model_name):
                full_path = model_name
            else:
                for d in search_dirs:
                    if os.path.exists(d):
                        for f in glob.glob(os.path.join(d, "**", model_name), recursive=True):
                            full_path = f
                            break
                        if full_path:
                            break
                    candidate = os.path.join(d, model_name)
                    if os.path.exists(candidate):
                        full_path = candidate
                        break

            if not full_path:
                return self._json({"ok": False, "msg": f"Model '{model_name}' not found"})

            prov = cfg.get("llm", {}).get("active_provider", "llamacpp")
            cfg.setdefault("llm", {}).setdefault("providers", {}).setdefault(prov, {})
            cfg["llm"]["providers"][prov]["model_path"] = full_path
            save_config(cfg)

            if self.agent:
                self.agent.config = cfg
                self.agent._rebuild_llm()
                _stats.inc("model_switches")
            _broker.broadcast("model_switched", {
                "model": os.path.basename(full_path),
                "path":  full_path,
            })
            return self._json({"ok": True, "loaded": os.path.basename(full_path)})

        if path == "/api/reset":
            if self.agent: self.agent.reset()
            return self._json({"status": "reset"})

        return self._json({"error": "Not found"}, 404)

    def _chat_sse(self, message: str, abort_ev: threading.Event):
        for token in self.agent.chat_stream(message):
            if abort_ev.is_set(): break
            if not self._sse({"type": "token", "token": token}): break
        self._sse({"type": "done", "response": ""})

    def _agent_sse(self, message: str, abort_ev: threading.Event):
        tcs = []
        self.agent.on_token = lambda t: self._sse({"type": "token", "token": t})
        self.agent.on_tool_call = lambda n, a: (tcs.append({"tool": n, "args": a}), self._sse({"type": "tool_call", "tool": n, "args": a}))
        self.agent.on_tool_result = lambda n, r: self._sse({"type": "tool_result", "tool": n, "result": str(r)[:1000]})
        self.agent.set_abort_event(abort_ev)
        response = self.agent.run(message)
        self.agent.set_abort_event(None)
        self._sse({"type": "done", "response": response, "tool_calls": tcs})

    def _run_agent_task_bg(self, task_id: str, intent: str, conversation_id: str, user_id: str, modality: str):
        agent = axonizHandler.agent
        if not agent:
            return
            
        t0 = time.time()
        
        # Broadcast task started
        _broker.broadcast("task_started", {
            "taskId": task_id,
            "conversationId": conversation_id,
            "userId": user_id,
            "intent": intent,
            "modality": modality,
            "agentState": "analyzing"
        })
        
        # Broadcast state change to thinking
        _broker.broadcast("agent_state_changed", {
            "taskId": task_id,
            "newState": "thinking",
            "orbColor": "cyan",
            "message": "Analyzing request..."
        })
        
        # Track activities
        activities_count = [0]
        
        # Setup callbacks
        active_activity = {}
        
        def on_tool_call(name, args):
            activities_count[0] += 1
            activity_id = f"act_{uuid.uuid4().hex[:8]}"
            active_activity[name] = (activity_id, time.time())
            
            # Broadcast activity started
            _broker.broadcast("activity_started", {
                "taskId": task_id,
                "activityId": activity_id,
                "toolName": name,
                "description": f"Executing tool: {name}",
                "input": args,
                "estimatedDuration": 2000
            })
            
            # Broadcast state change to executing
            _broker.broadcast("agent_state_changed", {
                "taskId": task_id,
                "newState": "executing",
                "orbColor": "yellow",
                "message": f"Running {name}..."
            })
            
        def on_tool_result(name, result):
            if name in active_activity:
                activity_id, start_time = active_activity.pop(name)
                duration = int((time.time() - start_time) * 1000)
                
                # Broadcast activity completed
                _broker.broadcast("activity_completed", {
                    "taskId": task_id,
                    "activityId": activity_id,
                    "toolName": name,
                    "status": "error" if "error" in str(result).lower() else "success",
                    "output": str(result)[:1000],
                    "duration": duration
                })
                
            # Revert back to thinking
            _broker.broadcast("agent_state_changed", {
                "taskId": task_id,
                "newState": "thinking",
                "orbColor": "cyan",
                "message": "Planning next steps..."
            })
            
        agent.on_tool_call = on_tool_call
        agent.on_tool_result = on_tool_result
        
        try:
            response = agent.run(intent)
            
            # Broadcast the agent message
            _broker.broadcast("agent_message", {
                "taskId": task_id,
                "messageId": f"msg_{uuid.uuid4().hex[:8]}",
                "content": response,
                "modality": modality
            })
            
            # Broadcast task completed
            _broker.broadcast("task_completed", {
                "taskId": task_id,
                "conversationId": conversation_id,
                "status": "success",
                "result": response,
                "duration": int((time.time() - t0) * 1000),
                "activitiesCount": activities_count[0]
            })
            
            # Broadcast success state
            _broker.broadcast("agent_state_changed", {
                "taskId": task_id,
                "newState": "complete",
                "orbColor": "green"
            })
            
        except Exception as e:
            # Broadcast error state
            _broker.broadcast("agent_state_changed", {
                "taskId": task_id,
                "newState": "error",
                "orbColor": "red",
                "message": str(e)
            })
            
            # Broadcast task completed with failure
            _broker.broadcast("task_completed", {
                "taskId": task_id,
                "conversationId": conversation_id,
                "status": "failed",
                "error": str(e),
                "duration": int((time.time() - t0) * 1000),
                "activitiesCount": activities_count[0]
            })
        finally:
            # Reset callbacks
            agent.on_tool_call = None
            agent.on_tool_result = None

class WebServer:
    def __init__(self, agent: Agent, host: str = "localhost", port: int = 7860):
        self.agent = agent
        self.host  = host
        self.port  = port
        axonizHandler.agent = agent

    def start(self, open_browser: bool = True):
        server = _QuietServer((self.host, self.port), axonizHandler)
        url = f"http://{self.host}:{self.port}"
        print(f"\n  \033[97mAXONIZ (Axodex)\033[0m \033[90mLlamaCpp Edition\033[0m")
        print(f"  \033[90mweb -> \033[94m{url}\033[0m\n")
        if open_browser:
            threading.Thread(target=lambda: (time.sleep(1.0), webbrowser.open(url)), daemon=True).start()
        try: server.serve_forever()
        except KeyboardInterrupt: server.shutdown()
