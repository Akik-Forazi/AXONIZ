# AXONIZ Frontend Upgrade Plan — Open-WebUI Inspired
**Target:** Transform AXONIZ from vanilla JS to a modern, production-grade UI

---

## Current State Analysis

### AXONIZ Current Stack
- **Frontend:** Vanilla JavaScript (`app.js` ~2000 lines)
- **Styling:** Custom CSS (`style.css`)
- **Backend:** Python FastAPI (`server.py`)
- **Assets:** Single `index.html`

### Open-WebUI Stack (Inspiration)
- **Frontend:** Svelte 5 + SvelteKit
- **Styling:** TailwindCSS 4 + Typography plugin
- **Build:** Vite + TypeScript
- **State:** Svelte stores
- **Components:** Modular, typed, reactive
- **Features:** i18n, dark mode, PWA, real-time updates

---

## Phase 1: Quick Wins (Immediate - 2 hours) ✅ **DO THIS NOW**

### 1.1 Fix Critical Backend-Frontend Disconnects
**Problem:** Frontend makes API calls to endpoints that don't exist or return wrong data.

**Files to fix:**
- `axoniz/web/server.py` — Add missing endpoints
- `axoniz/web/static/app.js` — Fix API calls

**Missing Endpoints to Add:**
```python
# In server.py, add these routes:

@app.route("/api/tts/status")
def tts_status():
    from axoniz.voice.tts import get_tts, _check_deps
    tts = get_tts()
    return jsonify({
        "backend": tts._backend,
        "available": tts.is_available,
        "voice": tts.voice,
        "dependencies": _check_deps(),
    })

@app.route("/api/models/discover")
def models_discover():
    """Discover .gguf files on filesystem."""
    import glob
    search_dirs = [
        os.path.expanduser("~/.cache/lm-studio/models"),
        os.path.expanduser("~/Downloads"),
        "C:\\Users\\*\\.cache\\lm-studio\\models" if sys.platform == "win32" else "",
    ]
    found = []
    for d in search_dirs:
        if not d or not os.path.exists(d): continue
        for gguf in glob.glob(f"{d}/**/*.gguf", recursive=True):
            found.append({
                "path": gguf,
                "name": os.path.basename(gguf),
                "size_gb": round(os.path.getsize(gguf) / (1024**3), 1),
                "type": "gguf",
            })
    return jsonify({"models": found})

@app.route("/api/models/load_local", methods=["POST"])
def models_load_local():
    """Load a .gguf file directly."""
    body = request.get_json()
    path = body.get("path", "")
    if not os.path.exists(path):
        return jsonify({"error": "File not found"}), 404
    try:
        agent.switch_backend("llamacpp", model_path=path)
        return jsonify({"ok": True, "model": os.path.basename(path)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/voice/speak", methods=["POST"])
def voice_speak():
    """TTS endpoint for voice responses."""
    body = request.get_json()
    text = body.get("text", "")
    voice = body.get("voice", "default")
    
    from axoniz.voice.tts import get_tts
    tts = get_tts()
    
    if body.get("async", False):
        tts.speak_async(text)
        return jsonify({"ok": True})
    else:
        success = tts.speak(text)
        return jsonify({"ok": success})

@app.route("/api/ast/stats")
def ast_stats():
    """AST index statistics."""
    return jsonify(agent.ast_index.stats())

@app.route("/api/ast/search", methods=["POST"])
def ast_search():
    body = request.get_json()
    symbol = body.get("symbol", "")
    results = agent.ast_index.find_symbol(symbol)
    return jsonify({"results": results})

@app.route("/api/trajectory/stats")
def trajectory_stats():
    """Trajectory store analytics."""
    return jsonify({
        "tool_stats": agent.trajectory.tool_stats(),
        "sessions": agent.trajectory.recent_sessions(10),
    })

@app.route("/api/predictor/stats")
def predictor_stats():
    """Predictive engine stats."""
    return jsonify(agent.predictor.get_stats())

@app.route("/api/mempalace/search", methods=["POST"])
def mempalace_search():
    body = request.get_json()
    query = body.get("query", "")
    results = agent.memory.palace.search(query, limit=10)
    return jsonify({"result": results})
```

### 1.2 Improve Current CSS (Open-WebUI inspired)
**File:** `axoniz/web/static/style.css`

Add TailwindCSS-like utility approach but keep vanilla CSS for now:

```css
/* Add at top of style.css */

/* ── Modern Design Tokens (Open-WebUI inspired) ─────────────── */
:root {
  /* Grays */
  --gray-50: #fafafa;
  --gray-100: #f5f5f5;
  --gray-200: #e5e5e5;
  --gray-300: #d4d4d4;
  --gray-400: #a3a3a3;
  --gray-500: #737373;
  --gray-600: #525252;
  --gray-700: #404040;
  --gray-800: #262626;
  --gray-850: #1f1f1f;
  --gray-900: #171717;
  --gray-950: #0a0a0a;
  
  /* Semantic colors */
  --background: var(--gray-950);
  --surface: var(--gray-900);
  --surface-hover: var(--gray-850);
  --border: rgba(255,255,255,0.08);
  --border-hover: rgba(255,255,255,0.15);
  
  /* Text */
  --text-primary: rgba(255,255,255,0.95);
  --text-secondary: rgba(255,255,255,0.65);
  --text-tertiary: rgba(255,255,255,0.45);
  
  /* Accent */
  --accent: #8b5cf6;
  --accent-hover: #a78bfa;
  --accent-text: #fff;
  
  /* Status */
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
  
  /* Layout */
  --sidebar-width: 260px;
  --header-height: 60px;
  --radius: 12px;
  --radius-lg: 16px;
  --radius-sm: 8px;
  
  /* Transitions */
  --transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Modern Layout (Open-WebUI style) ────────────────────────── */
body {
  background: var(--background);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Cards with modern depth ───────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  transition: all var(--transition);
}

.card:hover {
  border-color: var(--border-hover);
  background: var(--surface-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

/* ── Input fields (Open-WebUI style) ──────────────────────────── */
input[type="text"],
input[type="email"],
input[type="password"],
textarea,
select {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  padding: 10px 14px;
  font-size: 14px;
  transition: all var(--transition);
  width: 100%;
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}

/* ── Buttons (Open-WebUI style) ───────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all var(--transition);
  white-space: nowrap;
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-text);
}

.btn-primary:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}

.btn-secondary {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--surface-hover);
  border-color: var(--border-hover);
}

/* ── Loading states ──────────────────────────────────────────── */
.loading {
  position: relative;
  pointer-events: none;
  opacity: 0.6;
}

.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid var(--accent);
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Tooltips (Open-WebUI style) ────────────────────────────── */
[data-tooltip] {
  position: relative;
}

[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
  background: var(--gray-800);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition);
  z-index: 1000;
}

[data-tooltip]:hover::after {
  opacity: 1;
}

/* ── Toast notifications (Open-WebUI style) ──────────────────── */
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  min-width: 300px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  transform: translateY(100px);
  opacity: 0;
  transition: all var(--transition-slow);
  z-index: 9999;
}

.toast.show {
  transform: translateY(0);
  opacity: 1;
}

.toast.error {
  border-left: 4px solid var(--error);
}

.toast.success {
  border-left: 4px solid var(--success);
}

.toast.info {
  border-left: 4px solid var(--info);
}

/* ── Scrollbar (Open-WebUI style) ────────────────────────────── */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-hover);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.25);
}
```

---

## Phase 2: Component-ize Current UI (Week 1)

### 2.1 Break `app.js` into Modules
Split the monolithic `app.js` (2000 lines) into logical modules:

```
axoniz/web/static/
  ├── js/
  │   ├── api.js           ← API client (fetch wrappers)
  │   ├── chat.js          ← Chat logic
  │   ├── agent.js         ← Agent dashboard
  │   ├── settings.js      ← Settings panel
  │   ├── voice.js         ← Voice chat visualizer
  │   ├── swarm.js         ← Swarm orchestrator
  │   ├── files.js         ← File explorer
  │   ├── models.js        ← Model management
  │   ├── memory.js        ← Memory palace UI
  │   └── utils.js         ← Shared utilities
  ├── app.js              ← Main entry (imports modules)
  └── style.css
```

### 2.2 Add TypeScript Type Definitions
Create `types.d.ts`:
```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  tool: string;
  args: Record<string, any>;
  result?: string;
}

interface AgentConfig {
  provider: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  n_ctx: number;
}
```

---

## Phase 3: Svelte Migration (Week 2-3) — **Future**

This is the full rewrite. I'll create a starter template but won't implement it now.

### 3.1 Setup SvelteKit Project
```bash
cd axoniz/web
npm create svelte@latest frontend
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/typography
npx tailwindcss init
```

### 3.2 Directory Structure
```
axoniz/web/frontend/
  ├── src/
  │   ├── lib/
  │   │   ├── api/         ← API clients
  │   │   ├── components/  ← Reusable components
  │   │   ├── stores/      ← Svelte stores (state)
  │   │   └── utils/       ← Helpers
  │   ├── routes/
  │   │   ├── +layout.svelte          ← Root layout
  │   │   ├── +page.svelte            ← Home (chat)
  │   │   ├── agent/+page.svelte      ← Agent dashboard
  │   │   ├── settings/+page.svelte   ← Settings
  │   │   └── voice/+page.svelte      ← Voice chat
  │   └── app.html
  ├── static/
  ├── svelte.config.js
  ├── tailwind.config.js
  └── vite.config.js
```

### 3.3 Key Components to Build
- `ChatPanel.svelte` — Main chat UI
- `MessageList.svelte` — Chat messages
- `InputArea.svelte` — Chat input with voice
- `Sidebar.svelte` — Navigation + chat history
- `ModelSelector.svelte` — Model switcher
- `SettingsPanel.svelte` — All settings
- `VoiceVisualizer.svelte` — 3D voice orb
- `AgentDashboard.svelte` — Stats + trajectory
- `FileExplorer.svelte` — File tree
- `MemoryPalace.svelte` — Palace visualization

---

## Implementation NOW (Phase 1 fixes)

I'll implement Phase 1 improvements right now to fix the immediate issues and make the current UI more polished.

**Files I'll modify:**
1. `axoniz/web/server.py` — Add missing endpoints
2. `axoniz/web/static/style.css` — Modernize styling
3. `axoniz/web/static/app.js` — Fix API calls

**This will take ~2 hours and give you:**
- ✅ Working TTS status display
- ✅ Model discovery from filesystem
- ✅ Better error handling
- ✅ Modern Open-WebUI-inspired styling
- ✅ All backend endpoints properly connected

Would you like me to proceed with Phase 1 implementation now?
