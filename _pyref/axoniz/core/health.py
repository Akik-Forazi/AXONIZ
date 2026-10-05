"""Health check system for production monitoring."""
import time
import psutil
from typing import Dict, Any
from pathlib import Path

class HealthCheck:
    """System health monitoring."""
    
    def __init__(self):
        self.start_time = time.time()
    
    def check_all(self) -> Dict[str, Any]:
        """Run all health checks."""
        return {
            "status": "healthy",
            "timestamp": time.time(),
            "uptime_seconds": time.time() - self.start_time,
            "checks": {
                "memory": self._check_memory(),
                "disk": self._check_disk(),
                "backend": self._check_backend(),
                "database": self._check_database()
            }
        }
    
    def _check_memory(self) -> Dict[str, Any]:
        """Check memory usage."""
        mem = psutil.virtual_memory()
        return {
            "status": "ok" if mem.percent < 90 else "warning",
            "used_percent": mem.percent,
            "available_mb": mem.available / 1024 / 1024
        }
    
    def _check_disk(self) -> Dict[str, Any]:
        """Check disk space."""
        disk = psutil.disk_usage('/')
        return {
            "status": "ok" if disk.percent < 90 else "warning",
            "used_percent": disk.percent,
            "available_gb": disk.free / 1024 / 1024 / 1024
        }
    
    def _check_backend(self) -> Dict[str, Any]:
        """Check LLM backend connection."""
        try:
            # Try to connect to backend
            from axoniz.core.backend import get_backend
            from axoniz.core.config import load_config
            cfg = load_config()
            backend = get_backend(cfg)
            health = backend.health_check()
            return {
                "status": "ok",
                "details": health
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }
    
    def _check_database(self) -> Dict[str, Any]:
        """Check trajectory database."""
        try:
            db_path = Path.home() / ".axoniz" / "trajectory.db"
            if not db_path.exists():
                return {"status": "warning", "message": "Database not initialized"}
            
            # Check if writable
            db_path.touch()
            return {"status": "ok"}
        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }
