"""
Axoniz-Zero Model Downloader
============================
Fetches GGUF models from HuggingFace directly.
"""

import os
import sys
import threading
from huggingface_hub import hf_hub_download, HfApi
from axoniz.core.config import MODELS_DIR
from axoniz.core.debug import info, error, debug

_downloads = {} # track progress {filename: percent}

def search_models(query: str = "gguf", limit: int = 10):
    """Search HuggingFace for GGUF models."""
    api = HfApi()
    try:
        models = api.list_models(
            search=query,
            filter="gguf",
            sort="downloads",
            limit=limit
        )
        results = []
        for m in models:
            results.append({
                "id": m.id,
                "author": m.author,
                "lastModified": m.last_modified,
                "downloads": m.downloads,
                "likes": m.likes,
            })
        return results
    except Exception as e:
        error(f"[Downloader] search failed: {e}")
        return []

def download_model_async(repo_id: str, filename: str, token: str = None):
    """Run download in a background thread."""
    def _target():
        _downloads[filename] = 0
        try:
            dest = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=MODELS_DIR,
                token=token
            )
            _downloads[filename] = 100
            info(f"[Downloader] finished: {dest}")
        except Exception as e:
            error(f"[Downloader] {filename} failed: {e}")
            _downloads[filename] = -1

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    return f"Started download of {filename}"

def get_download_status():
    return _downloads

def download_model(repo_id: str, filename: str = None, token: str = None) -> str:
    """
    Download a GGUF model from HF.
    If filename is None, it tries to find the best Q4_K_M or Q8_0 GGUF.
    """
    info(f"[Downloader] repo={repo_id} | target={filename or 'auto'}")
    
    try:
        # Default filename patterns if not specified
        if not filename:
            # This is a bit complex without listing files, but let's assume common names 
            # or require the filename for now to be precise.
            # In a real app, we'd list files and pick.
            error("Filename is required for now (e.g. 'Llama-3.2-3B-Instruct-Q4_K_M.gguf')")
            return ""

        dest = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=MODELS_DIR,
            local_dir_use_symlinks=False,
            token=token
        )
        info(f"[Downloader] success -> {dest}")
        return dest
    except Exception as e:
        error(f"[Downloader] failed: {e}")
        return ""

def list_remote_ggufs(repo_id: str):
    """List available GGUF files in a repo."""
    from huggingface_hub import list_repo_files
    try:
        files = list_repo_files(repo_id)
        return [f for f in files if f.endswith(".gguf")]
    except Exception:
        return []
