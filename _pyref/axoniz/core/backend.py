"""
AXONIZ-ZERO Backend Engine — LlamaCpp Optimized
Supports local inference via llama.cpp only:
  - LlamaCpp        (.gguf direct in-process)
  - LlamaCppServer  (.gguf via llama-server HTTP)
"""

import json
import os
import subprocess
import time
import urllib.request
import urllib.error
from abc import ABC, abstractmethod
from typing import Any, Dict, Iterator, List, Optional
from axoniz.core.debug import debug, warn, error, log_json


# ─── Response types ───────────────────────────────────────────────────────────

class TextResponse:
    def __init__(self, text: str):
        self.text = text

class ToolCallResponse:
    def __init__(self, calls: List[Dict[str, Any]]):
        self.calls = calls


# ─── Abstract base ────────────────────────────────────────────────────────────

class Backend(ABC):
    """Universal interface every backend must implement."""

    @abstractmethod
    def complete(self, messages: List[Dict], max_tokens: int = None) -> Any:
        """Blocking completion. Returns TextResponse or ToolCallResponse."""
        pass

    @abstractmethod
    def stream_text(self, messages: List[Dict]) -> Iterator[str]:
        """Token-streaming completion. Yields str tokens."""
        pass

    def load(self) -> str:
        """Load/warm the model. Return 'ok' or error string."""
        return "ok"

    def is_loaded(self) -> bool:
        return True

    def unload(self):
        pass

    @abstractmethod
    def health_check(self) -> Dict[str, Any]:
        pass

    # Shared helper — HTTP POST without external libs
    def _http_post(self, url: str, payload: dict, headers: dict = None, timeout: int = 600) -> dict:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code}: {body[:400]}")
        except urllib.error.URLError as e:
            raise ConnectionError(f"Cannot connect to {url}: {e.reason}")

    def _http_stream(self, url: str, payload: dict, headers: dict = None, timeout: int = 300) -> Iterator[bytes]:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                for raw in r:
                    raw = raw.strip()
                    if raw:
                        yield raw
        except urllib.error.URLError as e:
            raise ConnectionError(f"Stream failed: {e.reason}")


# ─── 1. LLAMA-CPP (in-process, direct .gguf) ──────────────────────────────────

class LlamaCppBackend(Backend):
    """Load a GGUF file directly in-process via llama-cpp-python."""

    def __init__(self, model_path: str, temperature: float = 0.2,
                 max_tokens: int = 4096, n_ctx: int = 32768,
                 n_gpu_layers: int = -1, tools: list = None):
        self.model_path   = model_path
        self.temperature  = temperature
        self.max_tokens   = max_tokens
        self.n_ctx        = n_ctx
        self.n_gpu_layers = n_gpu_layers
        self.tools        = tools or []
        self._llm         = None

    def load(self) -> str:
        if not self.model_path or not os.path.exists(self.model_path):
            return f"[ERROR] GGUF not found: {self.model_path}"
        try:
            from llama_cpp import Llama
            # Optimized for small laptops + large context + prompt caching
            self._llm = Llama(
                model_path      = self.model_path,
                n_ctx           = self.n_ctx,
                n_gpu_layers    = self.n_gpu_layers,
                n_batch         = 512,
                n_threads       = max(1, (os.cpu_count() or 4) - 1),
                flash_attn      = True, # Enable Flash Attention if supported
                verbose         = False,
            )
            return "ok"
        except ImportError:
            return "[ERROR] llama-cpp-python not installed. Run: pip install llama-cpp-python"
        except Exception as e:
            return f"[ERROR] LlamaCpp load failed: {e}"

    def is_loaded(self) -> bool:
        return self._llm is not None

    def unload(self):
        if self._llm is not None:
            del self._llm
            self._llm = None
        import gc
        gc.collect()

    def complete(self, messages: List[Dict], max_tokens: int = None) -> Any:
        if not self._llm:
            res = self.load()
            if res != "ok":
                return TextResponse(res)
        try:
            limit = max_tokens or self.max_tokens
            resp = self._llm.create_chat_completion(
                messages    = messages,
                max_tokens  = limit,
                temperature = self.temperature,
            )
            content = resp["choices"][0]["message"].get("content", "")
            return TextResponse(content)
        except Exception as e:
            return TextResponse(f"[ERROR] LlamaCpp: {e}")

    def stream_text(self, messages: List[Dict]) -> Iterator[str]:
        if not self._llm:
            res = self.load()
            if res != "ok":
                yield res
                return
        try:
            stream = self._llm.create_chat_completion(
                messages    = messages,
                max_tokens  = self.max_tokens,
                temperature = self.temperature,
                stream      = True,
            )
            for chunk in stream:
                delta = chunk["choices"][0].get("delta", {})
                if "content" in delta and delta["content"]:
                    yield delta["content"]
        except Exception as e:
            yield f"[ERROR] LlamaCpp stream: {e}"

    def health_check(self) -> Dict:
        loaded = self.is_loaded()
        return {
            "status":  "ok" if loaded else "not_loaded",
            "backend": "llamacpp",
            "model":   os.path.basename(self.model_path) if self.model_path else "none",
            "loaded":  loaded,
        }


# ─── 2. LLAMA-CPP SERVER (external llama-server process) ─────────────────────

class LlamaCppServerBackend(Backend):
    """Connect to a running llama-server (or auto-start one)."""

    def __init__(self, base_url: str = "http://localhost:8080", model_path: str = "",
                 temperature: float = 0.2, max_tokens: int = 4096,
                 n_ctx: int = 8192, llama_bin: str = "", auto_start: bool = False,
                 n_gpu_layers: int = -1, tools: list = None):
        self.base_url     = base_url.rstrip("/")
        self.model_path   = model_path
        self.temperature  = temperature
        self.max_tokens   = max_tokens
        self.n_ctx        = n_ctx
        self.llama_bin    = llama_bin
        self.auto_start   = auto_start
        self.n_gpu_layers = n_gpu_layers
        self.tools        = tools or []
        self._proc        = None

        if auto_start and model_path:
            self._ensure_server()

    def _ensure_server(self):
        h = self.health_check()
        if h["status"] == "ok":
            return
        bin_path = self.llama_bin or "llama-server"
        if not os.path.isfile(bin_path) and not _which(bin_path):
            warn(f"[LlamaCppServer] binary not found: {bin_path}")
            return
        port = self.base_url.split(":")[-1].split("/")[0] or "8080"
        cmd = [
            bin_path, "-m", self.model_path,
            "--port", port,
            "--ctx-size", str(self.n_ctx),
            "-ngl", str(self.n_gpu_layers),
            "--threads", str(max(1, (os.cpu_count() or 4) - 1)),
        ]
        self._proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            time.sleep(0.5)
            if self.health_check()["status"] == "ok":
                debug(f"[LlamaCppServer] started at {self.base_url}")
                return
        warn("[LlamaCppServer] server did not start in time")

    def _headers(self) -> dict:
        return {"Content-Type": "application/json"}

    def complete(self, messages: List[Dict], max_tokens: int = None) -> Any:
        limit = max_tokens or self.max_tokens
        payload = {
            "model":       "local",
            "messages":    messages,
            "temperature": self.temperature,
            "max_tokens":  limit,
            "stream":      False,
        }
        try:
            resp = self._http_post(f"{self.base_url}/v1/chat/completions", payload, self._headers())
            content = resp["choices"][0]["message"].get("content", "")
            return TextResponse(content)
        except Exception as e:
            return TextResponse(f"[ERROR] LlamaCppServer: {e}")

    def stream_text(self, messages: List[Dict]) -> Iterator[str]:
        payload = {
            "model":       "local",
            "messages":    messages,
            "temperature": self.temperature,
            "max_tokens":  self.max_tokens,
            "stream":      True,
        }
        try:
            for raw in self._http_stream(f"{self.base_url}/v1/chat/completions", payload, self._headers()):
                line = raw.decode("utf-8", errors="replace").strip()
                if line.startswith("data: "):
                    chunk_str = line[6:].strip()
                    if chunk_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(chunk_str)
                        token = chunk["choices"][0].get("delta", {}).get("content", "")
                        if token:
                            yield token
                    except Exception:
                        continue
        except Exception as e:
            yield f"[ERROR] LlamaCppServer stream: {e}"

    def health_check(self) -> Dict:
        try:
            req = urllib.request.Request(f"{self.base_url}/health")
            with urllib.request.urlopen(req, timeout=3) as r:
                return {"status": "ok", "backend": "llamacpp_server", "url": self.base_url}
        except Exception as e:
            return {"status": "error", "error": str(e), "backend": "llamacpp_server"}


# ─── 3. OPENAI-COMPATIBLE (LM Studio, vLLM, Groq, OpenAI) ──────────────────────

class OpenAICompatibleBackend(Backend):
    def __init__(self, base_url: str, api_key: str = "", model_name: str = "local-model",
                 temperature: float = 0.2, max_tokens: int = 4096, tools: list = None):
        self.base_url    = base_url.rstrip("/")
        self.api_key     = api_key or "sk-no-key"
        self.model_name  = model_name
        self.temperature = temperature
        self.max_tokens  = max_tokens
        self.tools       = tools or []

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

    def complete(self, messages: List[Dict], max_tokens: int = None) -> Any:
        limit = max_tokens or self.max_tokens
        payload = {
            "model":       self.model_name,
            "messages":    messages,
            "temperature": self.temperature,
            "max_tokens":  limit,
            "stream":      False,
        }
        try:
            resp = self._http_post(f"{self.base_url}/chat/completions", payload, self._headers())
            content = resp["choices"][0]["message"].get("content", "")
            return TextResponse(content)
        except Exception as e:
            return TextResponse(f"[ERROR] OpenAI Backend: {e}")

    def stream_text(self, messages: List[Dict]) -> Iterator[str]:
        payload = {
            "model":       self.model_name,
            "messages":    messages,
            "temperature": self.temperature,
            "max_tokens":  self.max_tokens,
            "stream":      True,
        }
        try:
            for raw in self._http_stream(f"{self.base_url}/chat/completions", payload, self._headers()):
                line = raw.decode("utf-8", errors="replace").strip()
                if line.startswith("data: "):
                    chunk_str = line[6:].strip()
                    if chunk_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(chunk_str)
                        token = chunk["choices"][0].get("delta", {}).get("content", "")
                        if token:
                            yield token
                    except Exception:
                        continue
        except Exception as e:
            yield f"[ERROR] OpenAI Backend stream: {e}"

    def health_check(self) -> Dict:
        try:
            # Try getting models as a health check
            req = urllib.request.Request(f"{self.base_url}/models", headers=self._headers())
            with urllib.request.urlopen(req, timeout=3) as r:
                return {"status": "ok", "backend": "openai_compatible", "url": self.base_url}
        except Exception as e:
            return {"status": "error", "error": str(e), "backend": "openai_compatible"}


# ─── 4. OLLAMA ────────────────────────────────────────────────────────────────

class OllamaBackend(Backend):
    def __init__(self, base_url: str = "http://localhost:11434", model_name: str = "llama3",
                 temperature: float = 0.2, max_tokens: int = 4096, tools: list = None):
        self.base_url    = base_url.rstrip("/")
        self.model_name  = model_name
        self.temperature = temperature
        self.max_tokens  = max_tokens
        self.tools       = tools or []

    def _headers(self) -> dict:
        return {"Content-Type": "application/json"}

    def complete(self, messages: List[Dict], max_tokens: int = None) -> Any:
        # Ollama API structure
        payload = {
            "model":       self.model_name,
            "messages":    messages,
            "stream":      False,
            "options": {
                "temperature": self.temperature,
                "num_predict": max_tokens or self.max_tokens,
            }
        }
        try:
            resp = self._http_post(f"{self.base_url}/api/chat", payload, self._headers())
            content = resp.get("message", {}).get("content", "")
            return TextResponse(content)
        except Exception as e:
            return TextResponse(f"[ERROR] Ollama Backend: {e}")

    def stream_text(self, messages: List[Dict]) -> Iterator[str]:
        payload = {
            "model":       self.model_name,
            "messages":    messages,
            "stream":      True,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            }
        }
        try:
            for raw in self._http_stream(f"{self.base_url}/api/chat", payload, self._headers()):
                line = raw.decode("utf-8", errors="replace").strip()
                if line:
                    try:
                        chunk = json.loads(line)
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            yield token
                    except Exception:
                        continue
        except Exception as e:
            yield f"[ERROR] Ollama Backend stream: {e}"

    def health_check(self) -> Dict:
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags")
            with urllib.request.urlopen(req, timeout=3) as r:
                return {"status": "ok", "backend": "ollama", "url": self.base_url}
        except Exception as e:
            return {"status": "error", "error": str(e), "backend": "ollama"}


# ─── 5. LM STUDIO (LMS) ───────────────────────────────────────────────────────

class LMStudioBackend(Backend):
    """
    LM Studio Local Server backend.
    Uses LM Studio's native API for model discovery, loading, and chat.
    Falls back to OpenAI-compatible endpoints if native API is unavailable.
    Supports auto-start via the 'lms' CLI when available.
    """

    def __init__(self, base_url: str = "http://localhost:1234",
                 model_name: str = "", api_key: str = "lm-studio",
                 temperature: float = 0.2, max_tokens: int = 4096,
                 auto_load: bool = True, auto_start: bool = False,
                 lms_bin: str = "", tools: list = None):
        self.base_url     = base_url.rstrip("/")
        self.model_name   = model_name
        self.api_key      = api_key
        self.temperature  = temperature
        self.max_tokens   = max_tokens
        self.auto_load    = auto_load
        self.auto_start   = auto_start
        self.lms_bin      = lms_bin or "lms"
        self.tools        = tools or []
        self._loaded_model = None
        self._proc        = None
        self._use_native  = True

        if auto_start:
            self._ensure_server()

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _ensure_server(self):
        """Try to start the LM Studio server via lms CLI if not running."""
        h = self.health_check()
        if h["status"] == "ok":
            return
        if not _which(self.lms_bin):
            warn(f"[LMStudio] lms CLI not found on PATH: {self.lms_bin}")
            return
        try:
            subprocess.run([self.lms_bin, "server", "start"],
                           capture_output=True, timeout=30)
            for _ in range(60):
                time.sleep(0.5)
                if self.health_check()["status"] == "ok":
                    debug(f"[LMStudio] server started at {self.base_url}")
                    return
            warn("[LMStudio] server did not start in time")
        except Exception as e:
            warn(f"[LMStudio] auto-start failed: {e}")

    def _native_request(self, endpoint: str, payload: dict = None, method: str = "POST") -> dict:
        """Make a request to the LM Studio native API."""
        url = f"{self.base_url}/api/v1{endpoint}"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None
        h = self._headers()
        req = urllib.request.Request(url, data=data, headers=h, method=method)
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())

    def _discover_models(self) -> List[dict]:
        """List available models from LM Studio (native or OpenAI-compatible)."""
        try:
            data = self._native_request("/models", method="GET")
            return data.get("data", []) or (data if isinstance(data, list) else [])
        except Exception:
            try:
                req = urllib.request.Request(f"{self.base_url}/v1/models", headers=self._headers())
                with urllib.request.urlopen(req, timeout=3) as r:
                    data = json.loads(r.read())
                    return data.get("data", [])
            except Exception:
                return []

    def _get_loaded_model(self) -> Optional[dict]:
        """Return the currently loaded model, or None."""
        models = self._discover_models()
        for m in models:
            if m.get("state") == "loaded" or m.get("is_loaded"):
                return m
        return None

    def load(self) -> str:
        """Ensure a model is loaded. If model_name is set, load it explicitly."""
        # Check cached loaded model first (fast path)
        if self._loaded_model:
            if not self.model_name:
                self.model_name = self._loaded_model.get("id") or self._loaded_model.get("model_id") or ""
            return "ok"
        loaded = self._get_loaded_model()
        if loaded:
            self._loaded_model = loaded
            if not self.model_name:
                self.model_name = loaded.get("id") or loaded.get("model_id") or ""
            return "ok"
        if self.model_name and self.auto_load:
            try:
                self._native_request("/models/load", {"model": self.model_name})
                # Verify
                for _ in range(30):
                    loaded = self._get_loaded_model()
                    if loaded:
                        self._loaded_model = loaded
                        return "ok"
                    time.sleep(0.5)
                return "[ERROR] LMStudio: model load timed out"
            except Exception as e:
                return f"[ERROR] LMStudio: failed to load model: {e}"
        return "ok"

    def unload(self):
        """Unload the currently loaded model to free VRAM."""
        try:
            self._native_request("/models/unload", method="POST")
        except Exception:
            pass
        self._loaded_model = None
        try:
            if _which(self.lms_bin):
                subprocess.run([self.lms_bin, "unload"],
                               capture_output=True, timeout=30)
        except Exception:
            pass

    def is_loaded(self) -> bool:
        return self._loaded_model is not None or self._get_loaded_model() is not None

    def _resolve_model(self) -> str:
        """Return the model ID to use for the current request."""
        if self.model_name:
            return self.model_name
        if self._loaded_model:
            return self._loaded_model.get("id") or self._loaded_model.get("model_id") or "local"
        loaded = self._get_loaded_model()
        if loaded:
            return loaded.get("id") or loaded.get("model_id") or "local"
        return "local"

    # ── Native chat ────────────────────────────────────────────────────────────

    def _native_complete(self, messages: List[Dict], max_tokens: int = None) -> TextResponse:
        payload = {
            "model": self._resolve_model(),
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": max_tokens or self.max_tokens,
        }
        resp = self._native_request("/chat", payload)
        # LM Studio native response can be either:
        # { "content": "..." }  or  { "choices": [ { "message": { "content": "..." } } ] }
        content = resp.get("content", "")
        if not content and "choices" in resp:
            content = resp["choices"][0].get("message", {}).get("content", "")
        return TextResponse(content)

    def _native_stream(self, messages: List[Dict]) -> Iterator[str]:
        # Native streaming is not universally supported; use OpenAI-compatible fallback
        yield from self._openai_stream(messages)

    # ── OpenAI-compatible fallback ────────────────────────────────────────────

    def _openai_complete(self, messages: List[Dict], max_tokens: int = None) -> TextResponse:
        limit = max_tokens or self.max_tokens
        payload = {
            "model": self._resolve_model(),
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": limit,
            "stream": False,
        }
        resp = self._http_post(f"{self.base_url}/v1/chat/completions", payload, self._headers())
        content = resp["choices"][0]["message"].get("content", "")
        return TextResponse(content)

    def _openai_stream(self, messages: List[Dict]) -> Iterator[str]:
        payload = {
            "model": self._resolve_model(),
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": True,
        }
        for raw in self._http_stream(f"{self.base_url}/v1/chat/completions", payload, self._headers()):
            line = raw.decode("utf-8", errors="replace").strip()
            if line.startswith("data: "):
                chunk_str = line[6:].strip()
                if chunk_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(chunk_str)
                    token = chunk["choices"][0].get("delta", {}).get("content", "")
                    if token:
                        yield token
                except Exception:
                    continue

    # ── Public interface ──────────────────────────────────────────────────────

    def complete(self, messages: List[Dict], max_tokens: int = None) -> Any:
        if self._use_native:
            try:
                return self._native_complete(messages, max_tokens)
            except Exception as e:
                debug(f"[LMStudio] native chat failed ({e}), falling back to OpenAI-compatible")
        try:
            return self._openai_complete(messages, max_tokens)
        except Exception as e:
            return TextResponse(f"[ERROR] LMStudio: {e}")

    def stream_text(self, messages: List[Dict]) -> Iterator[str]:
        try:
            yield from self._native_stream(messages)
        except Exception as e:
            yield f"[ERROR] LMStudio stream: {e}"

    def health_check(self) -> Dict:
        try:
            loaded = self._get_loaded_model()
            if loaded:
                return {
                    "status": "ok",
                    "backend": "lmstudio",
                    "url": self.base_url,
                    "model": loaded.get("id") or loaded.get("model_id"),
                }
            # Server is up but no model loaded
            req = urllib.request.Request(f"{self.base_url}/api/v1/models", headers=self._headers())
            with urllib.request.urlopen(req, timeout=3) as r:
                return {"status": "no_model", "backend": "lmstudio", "url": self.base_url}
        except Exception:
            try:
                req = urllib.request.Request(f"{self.base_url}/v1/models", headers=self._headers())
                with urllib.request.urlopen(req, timeout=3) as r:
                    return {"status": "no_model", "backend": "lmstudio", "url": self.base_url}
            except Exception as e:
                return {"status": "error", "error": str(e), "backend": "lmstudio"}


# ─── FACTORY ──────────────────────────────────────────────────────────────────

def get_backend(cfg: dict, tools: list = None) -> Backend:
    """
    Build the right backend from the new hierarchical config dict.
    """
    # Fallback to old flat config if `llm` is missing
    if "llm" not in cfg:
        prov = (cfg.get("provider") or cfg.get("backend") or "llamacpp").lower().strip()
        p_cfg = cfg
    else:
        prov = cfg["llm"].get("active_provider", "llamacpp")
        p_cfg = cfg["llm"].get("providers", {}).get(prov, {})

    debug(f"[Backend Factory] provider={prov}")

    if prov == "openai" or prov == "openai_compatible":
        return OpenAICompatibleBackend(
            base_url    = p_cfg.get("base_url", "https://api.openai.com/v1"),
            api_key     = p_cfg.get("api_key", ""),
            model_name  = p_cfg.get("model_name", "gpt-4o"),
            temperature = float(p_cfg.get("temperature", 0.2)),
            max_tokens  = int(p_cfg.get("max_tokens", 4096)),
            tools       = tools,
        )

    if prov == "ollama":
        return OllamaBackend(
            base_url    = p_cfg.get("base_url", "http://localhost:11434"),
            model_name  = p_cfg.get("model_name", "llama3"),
            temperature = float(p_cfg.get("temperature", 0.2)),
            max_tokens  = int(p_cfg.get("max_tokens", 4096)),
            tools       = tools,
        )

    if prov == "lmstudio":
        return LMStudioBackend(
            base_url     = p_cfg.get("base_url", "http://localhost:1234"),
            model_name   = p_cfg.get("model_name", ""),
            api_key      = p_cfg.get("api_key", "lm-studio"),
            temperature  = float(p_cfg.get("temperature", 0.2)),
            max_tokens   = int(p_cfg.get("max_tokens", 4096)),
            auto_load    = bool(p_cfg.get("auto_load", True)),
            auto_start   = bool(p_cfg.get("auto_start", False)),
            lms_bin      = p_cfg.get("lms_bin", ""),
            tools        = tools,
        )

    if prov in ("gguf_server", "llamacpp_server"):
        return LlamaCppServerBackend(
            base_url     = p_cfg.get("base_url", "http://localhost:8080"),
            model_path   = p_cfg.get("model_path", ""),
            temperature  = float(p_cfg.get("temperature", 0.2)),
            max_tokens   = int(p_cfg.get("max_tokens", 4096)),
            n_ctx        = int(p_cfg.get("n_ctx", 32768)),
            llama_bin    = p_cfg.get("llama_bin", ""),
            auto_start   = bool(p_cfg.get("auto_start", False)),
            n_gpu_layers = int(p_cfg.get("n_gpu_layers", -1)),
            tools        = tools,
        )

    # Default: llamacpp (in-process)
    return LlamaCppBackend(
        model_path    = p_cfg.get("model_path", ""),
        temperature   = float(p_cfg.get("temperature", 0.2)),
        max_tokens    = int(p_cfg.get("max_tokens", 4096)),
        n_ctx         = int(p_cfg.get("n_ctx", 32768)),
        n_gpu_layers  = int(p_cfg.get("n_gpu_layers", -1)),
        tools         = tools,
    )


# ─── Helper utilities ─────────────────────────────────────────────────────────

def _which(name: str) -> bool:
    """Check if a binary exists on PATH."""
    import shutil
    return shutil.which(name) is not None

def list_supported_providers() -> List[Dict[str, str]]:
    """Returns a list of all supported providers for UI display."""
    return [
        {"id": "llamacpp",        "name": "LlamaCpp (Direct GGUF)",   "requires": "llama-cpp-python",      "model_format": ".gguf file path"},
        {"id": "llamacpp_server", "name": "LlamaCpp Server",          "requires": "llama-server binary",   "model_format": ".gguf file path"},
        {"id": "lmstudio",        "name": "LM Studio (LMS)",          "requires": "LM Studio running",     "model_format": "model name or path"},
        {"id": "openai",          "name": "OpenAI / Compatible",      "requires": "api_key + base_url",    "model_format": "model name string"},
        {"id": "ollama",          "name": "Ollama",                   "requires": "Ollama running",        "model_format": "model name string"},
    ]
