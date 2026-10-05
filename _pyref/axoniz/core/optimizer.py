"""
AXONIZ BackendOptimizer — Hardware-aware performance tuning.
Benchmarks the local device and optimizes LLM backend settings.
"""

import os
import sys
import platform
import multiprocessing
import logging
from typing import Dict, Any

logger = logging.getLogger("axoniz.optimizer")

def get_hardware_profile() -> Dict[str, Any]:
    profile = {
        "os": platform.system(),
        "cpu_count": multiprocessing.cpu_count(),
        "total_ram_gb": 0,
        "has_gpu": False,
        "gpu_info": "",
    }
    
    # RAM
    try:
        import psutil
        profile["total_ram_gb"] = round(psutil.virtual_memory().total / (1024**3), 2)
    except ImportError:
        pass

    # GPU (Basic check for NVIDIA)
    try:
        import subprocess
        if platform.system() == "Windows":
            cmd = ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
            if res.returncode == 0:
                profile["has_gpu"] = True
                profile["gpu_info"] = res.stdout.strip()
        else:
            # Linux/Mac check
            res = subprocess.run(["which", "nvidia-smi"], capture_output=True)
            if res.returncode == 0:
                profile["has_gpu"] = True
    except Exception:
        pass

    return profile

def optimize_config(current_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Returns an optimized version of the config based on hardware."""
    hw = get_hardware_profile()
    new_cfg = current_cfg.copy()
    
    # CPU Threads: typically N-1 or N/2 for optimal performance
    threads = max(1, hw["cpu_count"] - 1)
    if hw["cpu_count"] > 8:
        threads = hw["cpu_count"] - 2
    
    new_cfg["n_threads"] = threads
    
    # Context Size: match RAM
    if hw["total_ram_gb"] > 32:
        new_cfg.setdefault("n_ctx", 16384)
    elif hw["total_ram_gb"] > 16:
        new_cfg.setdefault("n_ctx", 8192)
    else:
        new_cfg.setdefault("n_ctx", 4096)

    # GPU Layers for LlamaCpp
    if hw["has_gpu"]:
        # If we have a GPU, try to offload most layers
        # Default to a safe high number for modern GPUs
        new_cfg.setdefault("n_gpu_layers", 35)
    else:
        new_cfg["n_gpu_layers"] = 0

    # Flash Attention (if supported by backend)
    new_cfg["flash_attn"] = True

    return new_cfg

def apply_optimizations(agent):
    """Applies optimizations directly to a running agent's backend."""
    current = agent.config
    optimized = optimize_config(current)
    agent.config.update(optimized)
    agent._rebuild_llm()
    return optimized
