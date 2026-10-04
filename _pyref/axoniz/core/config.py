"""
AXONIZ-ZERO Configuration
Central config: ~/.axoniz/config.json
"""

import json
import os
import copy

AXONIZ_HOME = os.path.expanduser("~/.axoniz")
MODELS_DIR  = os.path.join(AXONIZ_HOME, "models")
LLAMA_BIN_DIR = os.path.join(AXONIZ_HOME, "llama")
CONFIG_PATH = os.path.join(AXONIZ_HOME, "config.json")
MEMORY_PATH = os.path.join(AXONIZ_HOME, "memory.json")
HISTORY_DIR = os.path.join(AXONIZ_HOME, "history")

os.makedirs(MODELS_DIR,  exist_ok=True)
os.makedirs(HISTORY_DIR, exist_ok=True)

def model_dir(name: str) -> str:
    return os.path.join(MODELS_DIR, name)

DEFAULTS = {
    "general": {
        "workspace": ".",
        "web_port": 7860,
        "theme": "dark"
    },
    "llm": {
        "active_provider": "llamacpp",
        "providers": {
            "llamacpp": {
                "model_path": "",
                "llama_bin": "",
                "n_gpu_layers": -1,
                "n_ctx": 32768,
                "temperature": 0.2,
                "max_tokens": 4096
            },
            "llamacpp_server": {
                "base_url": "http://localhost:8080",
                "model_path": "",
                "llama_bin": "",
                "n_gpu_layers": -1,
                "n_ctx": 32768,
                "temperature": 0.2,
                "max_tokens": 4096,
                "auto_start": False
            },
            "openai": {
                "api_key": "",
                "base_url": "https://api.openai.com/v1",
                "model_name": "gpt-4o",
                "temperature": 0.2,
                "max_tokens": 4096
            },
            "ollama": {
                "base_url": "http://localhost:11434",
                "model_name": "llama3",
                "temperature": 0.2,
                "max_tokens": 4096
            },
            "lmstudio": {
                "base_url": "http://localhost:1234",
                "model_name": "",
                "api_key": "lm-studio",
                "temperature": 0.2,
                "max_tokens": 4096,
                "auto_load": True,
                "auto_start": False,
                "lms_bin": ""
            }
        }
    },
    "agent": {
        "max_steps": 30,
        "persona_override": "",
        "tools": {
            "file_system": True,
            "web_search": False,
            "axodex_graph": True
        }
    },
    "memory": {
        "palace_enabled": True,
        "kg_enabled": True
    },
    "swarm_models": {
        "decomposer": "",
        "worker": "",
        "critic": "",
        "merger": ""
    }
}

def deep_merge(target: dict, source: dict) -> dict:
    for k, v in source.items():
        if k in target and isinstance(target[k], dict) and isinstance(v, dict):
            deep_merge(target[k], v)
        else:
            target[k] = copy.deepcopy(v)
    return target

def migrate_legacy_config(saved: dict) -> dict:
    """Convert old flat configs to the new hierarchical structure."""
    if "general" in saved or "llm" in saved:
        return saved # Already modern
    
    modern = copy.deepcopy(DEFAULTS)
    
    # General
    if "workspace" in saved: modern["general"]["workspace"] = saved["workspace"]
    if "web_port" in saved: modern["general"]["web_port"] = saved["web_port"]
    
    # LLM
    provider = saved.get("provider", saved.get("backend", "llamacpp"))
    modern["llm"]["active_provider"] = provider
    
    if provider in modern["llm"]["providers"]:
        p_cfg = modern["llm"]["providers"][provider]
        if "model_path" in saved: p_cfg["model_path"] = saved["model_path"]
        if "llama_bin" in saved: p_cfg["llama_bin"] = saved["llama_bin"]
        if "n_gpu_layers" in saved: p_cfg["n_gpu_layers"] = saved["n_gpu_layers"]
        if "n_ctx" in saved: p_cfg["n_ctx"] = saved["n_ctx"]
        if "temperature" in saved: p_cfg["temperature"] = saved["temperature"]
        if "max_tokens" in saved: p_cfg["max_tokens"] = saved["max_tokens"]
        if "base_url" in saved: p_cfg["base_url"] = saved["base_url"]
        
    # Agent
    if "max_steps" in saved: modern["agent"]["max_steps"] = saved["max_steps"]
    
    return modern

def load_config() -> dict:
    cfg = copy.deepcopy(DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                saved = migrate_legacy_config(saved)
                deep_merge(cfg, saved)
        except Exception:
            pass
    return cfg

def save_config(cfg: dict):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

def show_config():
    cfg = load_config()
    print("\n\033[96m[AXONIZ-ZERO Configuration]\033[0m")
    print(json.dumps(cfg, indent=2))
    print(f"\n  Config: {CONFIG_PATH}\n")

def set_config(**kwargs):
    # Flattened set for backward compatibility if needed, but not strictly required
    # for the UI. Left as no-op or basic wrapper if scripts use it.
    pass

def reset_config():
    save_config(copy.deepcopy(DEFAULTS))
    print("\033[93m[Config] Reset to defaults.\033[0m")

def load_config_with_autodetect() -> dict:
    cfg = load_config()

    prov = cfg["llm"]["active_provider"]
    if prov in ["llamacpp", "llamacpp_server"]:
        p_cfg = cfg["llm"]["providers"][prov]
        if not p_cfg.get("llama_bin"):
            import sys
            suffix = ".exe" if sys.platform == "win32" else ""
            target = f"llama-server{suffix}"
            path = os.path.join(LLAMA_BIN_DIR, target)
            if os.path.exists(path):
                p_cfg["llama_bin"] = path
            elif os.path.exists(target):
                p_cfg["llama_bin"] = os.path.abspath(target)

    resolve_swarm_models(cfg)
    return cfg


def resolve_swarm_models(cfg: dict) -> None:
    """
    Resolve swarm_models name/basename entries to full absolute paths.
    Searches known model directories so config.json can store just
    a bare filename like 'qwen2.5-coder-1.5b.Q5_K_M.gguf'.
    Mutates cfg in-place.
    """
    import glob as _glob
    swarm = cfg.get("swarm_models", {})
    if not any(swarm.values()):
        return  # nothing configured, skip silently

    search_dirs = _get_model_search_dirs()
    for role, entry in swarm.items():
        if not entry:
            continue
        if os.path.isabs(entry) and os.path.exists(entry):
            continue  # already a valid absolute path
        # Try to resolve by name
        resolved = None
        for d in search_dirs:
            if not os.path.isdir(d):
                continue
            for hit in _glob.glob(os.path.join(d, "**", entry), recursive=True):
                resolved = hit
                break
            if not resolved:
                candidate = os.path.join(d, entry)
                if os.path.exists(candidate):
                    resolved = candidate
                    break
            if resolved:
                break
        if resolved:
            swarm[role] = resolved
        else:
            import warnings
            warnings.warn(f"[SwarmConfig] Model '{entry}' for role '{role}' not found in any search dir.")


def _get_model_search_dirs() -> list:
    """Return ordered list of directories to scan for .gguf files."""
    import sys
    home = os.path.expanduser("~")
    dirs = [
        MODELS_DIR,
        os.path.join(home, "lmstudio-community"),
        os.path.join(home, ".cache", "lm-studio", "models"),
        os.path.join(home, "AppData", "Roaming", "LM Studio", "user", "models"),
        os.path.join(home, "Downloads"),
        ".",
    ]
    if sys.platform == "win32":
        dirs.append(r"C:\Users\akikf\lmstudio-community")
    return dirs
