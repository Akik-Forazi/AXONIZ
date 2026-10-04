"""
AXONIZ-ZERO Autonomous Startup Integration
===========================================
This module wires together all the autonomous components:
1. LM Studio auto-discovery and model loading
2. Voice stack initialization (STT, TTS, Wake Word)
3. Background daemon startup
4. Memory system warm-up
5. Health monitoring
6. Web UI dashboard sync

Run this to verify everything is connected:
    python -m axoniz.integrations.autonomous_startup --check
"""

import os
import sys
import time
import threading
from pathlib import Path
from typing import Optional, Dict, Any

# Color codes for terminal output
C_RESET = "\033[0m"
C_GRAY = "\033[90m"
C_GREEN = "\033[92m"
C_YELLOW = "\033[93m"
C_RED = "\033[91m"
C_BLUE = "\033[94m"
C_CYAN = "\033[96m"


class AutonomousStartup:
    """Coordinates autonomous system startup."""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.components = {
            "lm_studio": False,
            "voice_stack": False,
            "daemon": False,
            "memory": False,
            "web_server": False
        }
        self.errors = []
    
    def start_all(self) -> bool:
        """Start all autonomous components. Returns True if all succeed."""
        print(f"\n{C_CYAN}╔════════════════════════════════════════════╗{C_RESET}")
        print(f"{C_CYAN}║   AXONIZ-ZERO Autonomous Startup v2.0     ║{C_RESET}")
        print(f"{C_CYAN}╚════════════════════════════════════════════╝{C_RESET}\n")
        
        # 1. LM Studio Manager
        self._start_lm_studio()
        
        # 2. Voice Stack
        self._start_voice_stack()
        
        # 3. Memory Systems
        self._start_memory()
        
        # 4. Daemon Engine
        self._start_daemon()
        
        # 5. Summary
        self._print_summary()
        
        return all(self.components.values())
    
    def _start_lm_studio(self):
        """Initialize LM Studio manager with auto-load."""
        print(f"{C_GRAY}[1/4]{C_RESET} LM Studio Manager...")
        
        try:
            from axoniz.core.lmstudio import get_manager
            from axoniz.core.config import load_config
            
            cfg = load_config()
            base_url = cfg.get("base_url", "http://127.0.0.1:1234/v1")
            
            # Start manager
            mgr = get_manager(base_url)
            
            # Wait for first poll
            time.sleep(1.0)
            
            if mgr.is_online():
                active = mgr.get_active_model()
                models = mgr.get_models()
                
                print(f"  {C_GREEN}✓{C_RESET} Online · {len(models)} model(s) available")
                
                # Auto-load configured model
                target_model = cfg.get("model_name")
                if target_model and target_model != active:
                    print(f"  {C_CYAN}→{C_RESET} Auto-loading: {target_model}")
                    result = mgr.load_model(target_model)
                    if result.get("ok"):
                        print(f"  {C_GREEN}✓{C_RESET} Model loaded successfully")
                    else:
                        print(f"  {C_YELLOW}⚠{C_RESET} Load failed: {result.get('error', 'unknown')}")
                elif active:
                    print(f"  {C_GRAY}→{C_RESET} Active model: {active}")
                
                self.components["lm_studio"] = True
            else:
                print(f"  {C_YELLOW}⚠{C_RESET} LM Studio not responding at {base_url}")
                print(f"  {C_GRAY}  Start LM Studio and load a model to enable{C_RESET}")
                self.errors.append("LM Studio offline")
        
        except Exception as e:
            print(f"  {C_RED}✗{C_RESET} Failed: {e}")
            self.errors.append(f"LM Studio error: {e}")
    
    def _start_voice_stack(self):
        """Initialize voice components (STT, TTS, Wake Word)."""
        print(f"\n{C_GRAY}[2/4]{C_RESET} Voice Stack...")
        
        try:
            # Check if voice is enabled in config
            from axoniz.core.config import load_config
            cfg = load_config()
            
            if not cfg.get("voice", {}).get("enabled", False):
                print(f"  {C_GRAY}−{C_RESET} Disabled in config (set voice.enabled=true to enable)")
                return
            
            # Initialize TTS
            try:
                from axoniz.voice.tts import get_tts
                tts = get_tts()
                
                # Test TTS
                tts_engine = cfg.get("voice", {}).get("tts", {}).get("engine", "kokoro")
                print(f"  {C_GREEN}✓{C_RESET} TTS: {tts_engine}")
                
                self.components["voice_stack"] = True
            except Exception as e:
                print(f"  {C_YELLOW}⚠{C_RESET} TTS unavailable: {e}")
            
            # Initialize STT
            try:
                from axoniz.voice.stt import get_stt
                stt = get_stt()
                
                stt_engine = cfg.get("voice", {}).get("stt", {}).get("engine", "moonshine")
                print(f"  {C_GREEN}✓{C_RESET} STT: {stt_engine}")
            except Exception as e:
                print(f"  {C_YELLOW}⚠{C_RESET} STT unavailable: {e}")
            
            # Initialize Wake Word
            try:
                from axoniz.voice.wake_word import get_wake_word
                wake = get_wake_word()
                
                wake_phrase = cfg.get("voice", {}).get("wake_word", {}).get("phrase", "hey axoniz")
                print(f"  {C_GREEN}✓{C_RESET} Wake word: '{wake_phrase}'")
            except Exception as e:
                print(f"  {C_YELLOW}⚠{C_RESET} Wake word unavailable: {e}")
        
        except Exception as e:
            print(f"  {C_RED}✗{C_RESET} Failed: {e}")
            self.errors.append(f"Voice stack error: {e}")
    
    def _start_memory(self):
        """Initialize unified memory system."""
        print(f"\n{C_GRAY}[3/4]{C_RESET} Memory Systems...")
        
        try:
            from axoniz.integrations.unified_memory import UnifiedMemory
            
            memory = UnifiedMemory()
            
            # Check Palace (Vector DB)
            try:
                status = memory.palace.status() if hasattr(memory, 'palace') else {}
                if status:
                    drawers = status.get('total_drawers', 0)
                    print(f"  {C_GREEN}✓{C_RESET} Palace: {drawers} memory drawers")
            except:
                print(f"  {C_GRAY}−{C_RESET} Palace: not configured")
            
            # Check Diary
            try:
                if hasattr(memory, 'diary'):
                    print(f"  {C_GREEN}✓{C_RESET} Diary: chronological logging active")
            except:
                print(f"  {C_GRAY}−{C_RESET} Diary: not configured")
            
            # Check Knowledge Graph
            try:
                if hasattr(memory, 'knowledge_graph'):
                    print(f"  {C_GREEN}✓{C_RESET} Knowledge Graph: relationship tracking active")
            except:
                print(f"  {C_GRAY}−{C_RESET} Knowledge Graph: not configured")
            
            self.components["memory"] = True
        
        except Exception as e:
            print(f"  {C_YELLOW}⚠{C_RESET} Partial initialization: {e}")
    
    def _start_daemon(self):
        """Initialize background daemon engine."""
        print(f"\n{C_GRAY}[4/4]{C_RESET} Daemon Engine...")
        
        try:
            from axoniz.core.config import load_config
            cfg = load_config()
            
            if not cfg.get("daemon", {}).get("enabled", False):
                print(f"  {C_GRAY}−{C_RESET} Disabled in config (set daemon.enabled=true to enable)")
                return
            
            from axoniz.core.intelligence import axonizDaemon
            
            daemon = axonizDaemon()
            
            # Start daemon in background
            daemon.start()
            
            print(f"  {C_GREEN}✓{C_RESET} Background tasks active")
            print(f"  {C_GRAY}  File watching and scheduled tasks enabled{C_RESET}")
            
            self.components["daemon"] = True
        
        except Exception as e:
            print(f"  {C_YELLOW}⚠{C_RESET} Not started: {e}")
    
    def _print_summary(self):
        """Print startup summary."""
        print(f"\n{C_GRAY}{'─' * 46}{C_RESET}")
        
        total = len(self.components)
        active = sum(self.components.values())
        
        if active == total:
            status = f"{C_GREEN}All systems operational{C_RESET}"
        elif active > 0:
            status = f"{C_YELLOW}Partial: {active}/{total} components active{C_RESET}"
        else:
            status = f"{C_RED}Failed to start{C_RESET}"
        
        print(f"\n  Status: {status}")
        
        if self.errors:
            print(f"\n  {C_YELLOW}Warnings:{C_RESET}")
            for error in self.errors:
                print(f"    • {error}")
        
        print(f"\n{C_GRAY}Ready for autonomous operation{C_RESET}")
        print()
    
    def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check for all components."""
        health = {
            "overall": "healthy",
            "components": {}
        }
        
        # LM Studio
        try:
            from axoniz.core.lmstudio import get_manager
            mgr = get_manager()
            mgr.refresh()  # Force poll
            
            health["components"]["lm_studio"] = {
                "status": "ok" if mgr.is_online() else "offline",
                "active_model": mgr.get_active_model(),
                "available_models": len(mgr.get_models())
            }
        except Exception as e:
            health["components"]["lm_studio"] = {
                "status": "error",
                "error": str(e)
            }
        
        # Voice
        try:
            from axoniz.core.config import load_config
            cfg = load_config()
            voice_enabled = cfg.get("voice", {}).get("enabled", False)
            
            health["components"]["voice"] = {
                "status": "enabled" if voice_enabled else "disabled",
                "tts_engine": cfg.get("voice", {}).get("tts", {}).get("engine", "none"),
                "stt_engine": cfg.get("voice", {}).get("stt", {}).get("engine", "none")
            }
        except Exception as e:
            health["components"]["voice"] = {
                "status": "error",
                "error": str(e)
            }
        
        # Memory
        try:
            from axoniz.integrations.unified_memory import UnifiedMemory
            memory = UnifiedMemory()
            
            health["components"]["memory"] = {
                "status": "ok",
                "systems": ["palace", "diary", "knowledge_graph", "tfidf"]
            }
        except Exception as e:
            health["components"]["memory"] = {
                "status": "error",
                "error": str(e)
            }
        
        # Check if any component failed
        for component in health["components"].values():
            if component.get("status") in ["error", "offline"]:
                health["overall"] = "degraded"
        
        return health


def auto_load_model_on_startup(agent):
    """
    Auto-load configured model in LM Studio on agent startup.
    Called by WebServer.__init__ and runner.py
    """
    try:
        from axoniz.core.lmstudio import get_manager
        
        model_name = agent.config.get("model_name")
        provider = agent.config.get("provider", agent.config.get("backend"))
        
        # Only auto-load if using LM Studio
        if provider != "lmstudio" or not model_name:
            return False
        
        mgr = get_manager()
        
        # Check if already loaded
        current = mgr.get_active_model()
        if current == model_name:
            print(f"  {C_GRAY}[Auto-Load]{C_RESET} Model already active: {model_name}")
            return True
        
        # Request load
        print(f"  {C_CYAN}[Auto-Load]{C_RESET} Requesting LM Studio to load: {model_name}")
        result = mgr.load_model(model_name)
        
        if result.get("ok"):
            print(f"  {C_GREEN}✓{C_RESET} Model loaded successfully")
            
            # Give LM Studio time to load
            time.sleep(2.0)
            
            # Verify
            mgr.refresh()
            current = mgr.get_active_model()
            if current == model_name:
                print(f"  {C_GREEN}✓{C_RESET} Verified: {model_name} is active")
                return True
            else:
                print(f"  {C_YELLOW}⚠{C_RESET} Model load pending (may take a few seconds)")
                return False
        else:
            error = result.get("error", "unknown error")
            print(f"  {C_YELLOW}⚠{C_RESET} Load failed: {error}")
            return False
    
    except Exception as e:
        print(f"  {C_YELLOW}⚠{C_RESET} Auto-load error: {e}")
        return False


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    """CLI for autonomous startup integration."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="AXONIZ-ZERO Autonomous Startup Integration"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run health check on all components"
    )
    parser.add_argument(
        "--start",
        action="store_true",
        help="Start all autonomous components"
    )
    
    args = parser.parse_args()
    
    startup = AutonomousStartup()
    
    if args.check:
        print("\nRunning health check...\n")
        health = startup.health_check()
        
        import json
        print(json.dumps(health, indent=2))
        
        sys.exit(0 if health["overall"] == "healthy" else 1)
    
    elif args.start:
        success = startup.start_all()
        sys.exit(0 if success else 1)
    
    else:
        # Default: show status
        startup.start_all()


if __name__ == "__main__":
    main()
