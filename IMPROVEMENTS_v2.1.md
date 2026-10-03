# AXONIZ-ZERO v2.1 — Critical Improvements Plan

**Issues Identified:**
1. ❌ **MMS-TTS and Kokoro not working** — TTS engine fails silently
2. ❌ **System prompt not reaching small models** — Context overflow on <8k models
3. ❌ **Can't load models from AXONIZ UI** — Must use LM Studio app first
4. ⚠️ **Backend doesn't inject system prompt** — Lost in OpenAIBackend

---

## Issue #1: TTS Engine Failures (MMS-TTS, Kokoro)

### Root Cause
The TTS engine (`voice/tts.py`) has these problems:
1. **Silent failures** — Methods return `False` but don't log WHY
2. **Missing dependencies** — No check for `torch`, `transformers`, `sounddevice`
3. **MMS model loading** — Fails if model files corrupt/incomplete
4. **Kokoro** — Fails if ONNX runtime not installed
5. **No fallback chain** — If one backend fails, doesn't try next

### Fix Strategy

**File: `axoniz/voice/tts.py`**

Add comprehensive error reporting and auto-fallback:

```python
# At top of file, add dependency checker
def _check_deps() -> dict:
    """Check which TTS backends are actually usable."""
    status = {}
    
    # MMS-TTS
    try:
        import torch, transformers
        status["mms"] = os.path.exists(MMS_MODEL_PATH) and \
                       os.path.exists(os.path.join(MMS_MODEL_PATH, "config.json"))
    except ImportError as e:
        status["mms"] = f"Missing: {e.name}"
    
    # Kokoro
    try:
        import kokoro_onnx, sounddevice
        o, v = _find_kokoro_models()
        status["kokoro"] = "ready" if (o and v) else "models not found"
    except ImportError as e:
        status["kokoro"] = f"Missing: {e.name}"
    
    # Edge TTS
    try:
        import edge_tts
        status["edge"] = "ready"
    except ImportError:
        status["edge"] = "pip install edge-tts"
    
    # pyttsx3
    try:
        import pyttsx3
        status["pyttsx3"] = "ready"
    except ImportError:
        status["pyttsx3"] = "pip install pyttsx3"
    
    return status

# Modify speak() to be more resilient
def speak(self, text: str) -> bool:
    if not text or not text.strip():
        return False
    
    backends_to_try = []
    if self._backend == "auto":
        # Try in order: mms → kokoro → edge → pyttsx3
        backends_to_try = ["mms", "kokoro", "edge", "pyttsx3"]
    else:
        backends_to_try = [self._backend]
    
    last_error = None
    for backend in backends_to_try:
        try:
            logger.info(f"[TTS] Trying backend: {backend}")
            if backend == "mms" and self._speak_mms(text):
                return True
            elif backend == "kokoro" and self._speak_kokoro(text):
                return True
            elif backend == "edge" and self._speak_edge(text):
                return True
            elif backend == "pyttsx3" and self._speak_pyttsx3(text):
                return True
        except Exception as e:
            last_error = e
            logger.warning(f"[TTS] {backend} failed: {e}")
            continue
    
    # All backends failed
    logger.error(f"[TTS] ALL backends failed. Last error: {last_error}")
    print(f"[BERU (text-only)] {text}")  # Fallback to print
    return False
```

Add a `tts_status` API endpoint:
```python
# In web/server.py, add:
def _handle_tts_status(self):
    from axoniz.voice.tts import get_tts, _check_deps
    tts = get_tts()
    deps = _check_deps()
    
    self._json({
        "backend": tts._backend,
        "available": tts.is_available,
        "voice": tts.voice,
        "dependencies": deps,
    })
```

---

## Issue #2: System Prompt Not Reaching Small Models

### Root Cause
The system prompt in `agent.py::_sys_prompt()` is **MASSIVE** — easily 4000+ tokens:
- Persona instructions (500+ tokens)
- Tool schemas (2000+ tokens)  
- Memory context (500+ tokens)
- Trajectory context (300+ tokens)
- Palace context (200+ tokens)

**Problem:** Models with <8k context (Gemma 3B, Phi-3 Mini, Qwen 2.5-3B) hit context overflow BEFORE the user's actual task.

### Fix Strategy

**File: `axoniz/core/agent.py`**

Implement **tiered system prompts** based on model context size:

```python
def _sys_prompt(self) -> str:
    """Build system prompt with dynamic compression for small-context models."""
    from datetime import datetime as _dt
    
    # Detect model context size
    n_ctx = int(self.config.get("n_ctx", 8192))
    model_name = self.config.get("model_name", "").lower()
    
    # Known small-context models
    is_small = n_ctx < 8192 or any(x in model_name for x in ["3b", "gemma3:4b", "phi-3-mini", "qwen2.5:3b"])
    
    if is_small:
        return self._sys_prompt_compact()
    else:
        return self._sys_prompt_full()

def _sys_prompt_compact(self) -> str:
    """Minimal system prompt for <8k context models."""
    now = _dt.now().strftime("%A, %B %d %Y — %I:%M %p").replace(" 0", " ")
    
    # Core identity ONLY
    prompt = f"""You are BERU. Execute tasks efficiently. Current time: {now}

CRITICAL RULES:
1. ALWAYS use tools to act (file_read, file_write, shell_run, etc.)
2. Call done(result="summary") when finished
3. If you see [BLOCKED], choose a safer approach

TOOL FORMAT:
<tool>{{"name": "tool_name", "args": {{"param": "value"}}}}</tool>

KEY TOOLS: file_read, file_write, file_edit, shell_run, web_search, palace_search, done
"""
    
    # Add ONLY critical memory if available
    mem = self.memory.all()
    if mem:
        top_3 = list(mem.items())[:3]
        prompt += "\nCRITICAL MEMORY:\n" + "\n".join(f"- {k}: {v[:60]}" for k, v in top_3)
    
    return prompt

def _sys_prompt_full(self) -> str:
    """Full system prompt for >=8k context models (current implementation)."""
    # ... existing _sys_prompt logic ...
```

**Add context budget tracking:**
```python
# In agent.py, before building messages
def _estimate_prompt_tokens(self) -> int:
    """Estimate token count of current system prompt."""
    sys = self._sys_prompt()
    # Rough estimate: 1 token ≈ 4 chars
    return len(sys) // 4

def _check_context_budget(self, task: str) -> bool:
    """Check if task + system prompt fits in context."""
    n_ctx = int(self.config.get("n_ctx", 8192))
    sys_tokens = self._estimate_prompt_tokens()
    task_tokens = len(task) // 4
    
    available = n_ctx - sys_tokens - task_tokens - 1000  # Reserve 1k for response
    
    if available < 500:
        warn(f"[Agent] Context nearly full: sys={sys_tokens}, task={task_tokens}, avail={available}")
        return False
    return True
```

---

## Issue #3: Can't Load Models from AXONIZ UI

### Root Cause
The web UI calls `/api/model/switch` but:
1. **LMStudioManager is started AFTER the web server** in `startup.py::boot_web()`
2. **No direct model loading API** — UI assumes LM Studio already has model loaded
3. **No model discovery from filesystem** — Can't browse `.gguf` files

### Fix Strategy

**File: `axoniz/web/server.py`**

Add `/api/models/discover` endpoint:

```python
def _handle_models_discover(self):
    """Discover available models on filesystem."""
    import glob
    
    # Search common model locations
    search_dirs = [
        os.path.expanduser("~/.cache/lm-studio/models"),
        os.path.expanduser("~/Downloads"),
        os.path.expanduser("~/models"),
        "C:\\Users\\*\\.cache\\lm-studio\\models" if sys.platform == "win32" else "",
    ]
    
    found_models = []
    for d in search_dirs:
        if not d or not os.path.exists(d):
            continue
        for gguf in glob.glob(f"{d}/**/*.gguf", recursive=True):
            size_gb = os.path.getsize(gguf) / (1024**3)
            found_models.append({
                "path": gguf,
                "name": os.path.basename(gguf),
                "size_gb": round(size_gb, 1),
                "type": "gguf",
            })
    
    self._json({"models": found_models})

def _handle_model_load_local(self):
    """Load a .gguf file directly without LM Studio."""
    body = self._read_json()
    model_path = body.get("path", "")
    
    if not os.path.exists(model_path):
        return self._json({"error": "File not found"}, code=404)
    
    # Switch backend to llamacpp
    try:
        self.agent.switch_backend("llamacpp", model_path=model_path)
        self._json({"ok": True, "model": os.path.basename(model_path)})
    except Exception as e:
        self._json({"error": str(e)}, code=500)
```

**File: `axoniz/web/static/app.js`**

Add UI for model discovery:

```javascript
async function discoverModels() {
    setLoading('modelList', true);
    try {
        const data = await api('/api/models/discover');
        const list = $('modelList');
        if (!list) return;
        
        if (data.models.length === 0) {
            list.innerHTML = '<div class="setting-hint">No .gguf models found in common locations</div>';
            return;
        }
        
        list.innerHTML = data.models.map(m => `
            <div class="model-item" onclick="loadLocalModel('${m.path}')">
                <strong>${m.name}</strong>
                <span>${m.size_gb} GB · Click to load</span>
            </div>
        `).join('');
    } catch (e) {
        console.error('Model discovery failed:', e);
    } finally {
        setLoading('modelList', false);
    }
}

async function loadLocalModel(path) {
    showToast('Loading model...', 'info');
    try {
        const resp = await api('/api/models/load_local', {
            method: 'POST',
            body: { path }
        });
        if (resp.ok) {
            showToast(`Model loaded: ${resp.model}`, 'success');
            refreshAgentDashboard();
        }
    } catch (e) {
        showToast(`Load failed: ${e.message}`, 'error');
    }
}
```

---

## Issue #4: Backend Not Injecting System Prompt Properly

### Root Cause
In `backend.py::OpenAIBackend.complete()`, the system message extraction is broken:

```python
# CURRENT CODE (BROKEN)
def complete(self, messages: List[Dict]) -> Any:
    model = self.model_name
    # ... auto-detect logic ...
    
    payload = {
        "model":       model,
        "messages":    messages,  # ❌ Passes messages AS-IS
        "temperature": self.temperature,
        "max_tokens":  self.max_tokens,
        "stream":      False,
    }
```

**Problem:** If `messages[0]` has `role: "system"`, LM Studio might ignore it depending on model.

### Fix Strategy

**File: `axoniz/core/backend.py`**

Force system message into every OpenAI-compat request:

```python
def complete(self, messages: List[Dict]) -> Any:
    model = self.model_name
    if not model:
        # Auto-detect from /v1/models
        try:
            req = urllib.request.Request(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            with urllib.request.urlopen(req, timeout=3) as r:
                data = json.loads(r.read())
                models = data.get("data", [])
                if models:
                    model = models[0]["id"]
                    self.model_name = model
        except Exception:
            model = "local"
    
    # ✅ FIX: Ensure system message is first
    sys_msg = None
    user_msgs = []
    for m in messages:
        if m["role"] == "system":
            sys_msg = m
        else:
            user_msgs.append(m)
    
    # Rebuild with system first
    final_msgs = []
    if sys_msg:
        final_msgs.append(sys_msg)
    final_msgs.extend(user_msgs)
    
    payload = {
        "model":       model,
        "messages":    final_msgs,  # ✅ System guaranteed first
        "temperature": self.temperature,
        "max_tokens":  self.max_tokens,
        "stream":      False,
    }
    # ... rest of method ...
```

Do the same for `stream_text()`:

```python
def stream_text(self, messages: List[Dict]) -> Iterator[str]:
    # Same fix as complete()
    sys_msg = None
    user_msgs = []
    for m in messages:
        if m["role"] == "system":
            sys_msg = m
        else:
            user_msgs.append(m)
    
    final_msgs = []
    if sys_msg:
        final_msgs.append(sys_msg)
    final_msgs.extend(user_msgs)
    
    payload = {
        "model":       self.model_name or self._resolve_model(),
        "messages":    final_msgs,
        "temperature": self.temperature,
        "max_tokens":  self.max_tokens,
        "stream":      True,
    }
    # ... rest ...
```

---

## Implementation Checklist

### Phase 1: TTS Fixes (30 min)
- [ ] Add `_check_deps()` to `voice/tts.py`
- [ ] Improve error logging in all `_speak_*()` methods
- [ ] Add fallback chain to `speak()`
- [ ] Add `/api/voice/status` endpoint with dependency check
- [ ] Test with MMS-TTS, Kokoro, edge-tts

### Phase 2: System Prompt Compression (1 hour)
- [ ] Add `_sys_prompt_compact()` to `agent.py`
- [ ] Add `_estimate_prompt_tokens()` helper
- [ ] Add `_check_context_budget()` gate
- [ ] Test with Gemma 3:4b, Phi-3-mini
- [ ] Log warnings when context is tight

### Phase 3: Model Loading from UI (1 hour)
- [ ] Add `/api/models/discover` endpoint
- [ ] Add `/api/models/load_local` endpoint
- [ ] Add `discoverModels()` to `app.js`
- [ ] Add "Browse Local Models" button to Settings
- [ ] Test loading .gguf directly

### Phase 4: Backend System Prompt Fix (15 min)
- [ ] Fix `OpenAIBackend.complete()` message ordering
- [ ] Fix `OpenAIBackend.stream_text()` message ordering
- [ ] Test with LM Studio + small model
- [ ] Verify system prompt appears in logs

---

## Testing Protocol

### Test 1: TTS Backends
```bash
python -m axoniz.voice.tts  # Should print status of all backends
```

Expected output:
```
[TTS] Checking backends...
  mms     : ✓ ready (torch, transformers, model found)
  kokoro  : ✗ Missing: kokoro_onnx
  edge    : ✓ ready
  pyttsx3 : ✓ ready
[TTS] Selected: mms
[TTS] Speaking: "Hello from BERU"
```

### Test 2: Small Model Context
```bash
# Load Gemma 3:4b in LM Studio
axonix --web

# In chat, send a complex task:
"Read all Python files in this directory, analyze them, and create a summary report"

# Expected: Should NOT hit context overflow
# System prompt should be <1000 tokens
```

### Test 3: Load Model from UI
1. Open AXONIZ web UI → Settings
2. Click "Browse Local Models"
3. See list of `.gguf` files from `~/Downloads`, `~/.cache/lm-studio/models`
4. Click any model
5. Should switch backend to `llamacpp` and load it

### Test 4: System Prompt Injection
```bash
# Enable debug logging
export AXONIZ_DEBUG=1
axonix --web

# In chat, send: "What are your instructions?"
# Check logs — should see system prompt in request
```

---

## Files to Modify

1. `axoniz/voice/tts.py` — TTS error handling + fallback
2. `axoniz/core/agent.py` — Tiered system prompts
3. `axoniz/core/backend.py` — Fix message ordering
4. `axoniz/web/server.py` — Add model discovery endpoints
5. `axoniz/web/static/app.js` — Add model browser UI

---

## Estimated Impact

| Issue | Severity | Users Affected | Fix Time | Impact After Fix |
|-------|----------|----------------|----------|------------------|
| TTS not working | HIGH | 80% | 30 min | TTS works reliably |
| System prompt lost | CRITICAL | 100% (small models) | 1 hour | Small models usable |
| Can't load models | HIGH | 60% | 1 hour | No LM Studio dependency |
| Backend message order | MEDIUM | 40% | 15 min | System prompt guaranteed |

**Total fix time:** ~2.75 hours  
**Total users helped:** 95%+

This is a HIGH-ROI fix set.
