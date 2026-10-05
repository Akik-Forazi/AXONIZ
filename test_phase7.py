"""
test_phase7.py
===============
Test suite for Phase 7:
  - Authority engine
  - Workflow engine
  - Awareness service
  - Goal service
  - Sidecar client (offline graceful)
  - Dispatcher
  - TTS / STT info (no audio hardware needed)
  - Agent lazy-wiring (import smoke test)

Run with:  python -m pytest test_phase7.py -v
       or:  python test_phase7.py
"""

import os
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(__file__))

import pytest


# ════════════════════════════════════════════════════════════════════════════
# Authority Engine
# ════════════════════════════════════════════════════════════════════════════

class TestAuthorityEngine:

    def setup_method(self):
        from axoniz.core.authority import (
            AuthorityEngine, AuthLevel, AuditTrail,
            ApprovalLearner, ApprovalDelivery, _DEFAULT_RULES
        )
        self.AuthLevel = AuthLevel
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        e = object.__new__(AuthorityEngine)
        e.default_level = AuthLevel(3)
        e.audit    = AuditTrail(self.tmp.name)
        e.learner  = ApprovalLearner()
        e.delivery = ApprovalDelivery(timeout=0)   # 0 → instant timeout/deny
        e._rules   = dict(_DEFAULT_RULES)
        e.max_auto_level = 3
        e._lock    = threading.Lock()
        e._paused  = False
        e._id_counter = 0
        self.engine = e

    def teardown_method(self):
        try: os.unlink(self.tmp.name)
        except Exception: pass

    def test_autonomous_allowed(self):
        d = self.engine.check("file_read", {"path": "test.txt"})
        assert d.approved is True
        assert d.level == self.AuthLevel.AUTONOMOUS

    def test_log_only_allowed(self):
        d = self.engine.check("palace_store", {"wing": "w", "room": "r", "content": "x"})
        assert d.approved is True

    def test_soft_gate_allowed(self):
        d = self.engine.check("file_write", {"path": "output.txt", "content": "hi"})
        assert d.approved is True

    def test_require_approval_timeout_denied(self):
        d = self.engine.check("file_delete", {"path": "data.txt"})
        assert d.approved is False

    def test_emergency_pause_blocks_all(self):
        self.engine.emergency_pause()
        d = self.engine.check("file_read", {"path": "x"})
        assert d.approved is False
        self.engine.resume()
        d2 = self.engine.check("file_read", {"path": "x"})
        assert d2.approved is True

    def test_escalation_db_path(self):
        d = self.engine.check("file_write", {"path": "/data/store.db", "content": ""})
        assert d.level >= self.AuthLevel.REQUIRE_APPROVAL

    def test_audit_records(self):
        self.engine.check("file_read", {"path": "x"})
        self.engine.check("palace_store", {"wing": "w", "room": "r", "content": "x"})
        rows = self.engine.audit.recent(5)
        assert len(rows) >= 1

    def test_summary_string(self):
        self.engine.check("file_read", {"path": "x"})
        s = self.engine.summary()
        assert "Audit:" in s

    def test_learner_auto_approve(self):
        from axoniz.core.authority import ApprovalLearner
        l = ApprovalLearner()
        assert l.is_auto_approved("git_push") is False
        l.record_approval("git_push")
        l.record_approval("git_push")
        l.record_approval("git_push")
        assert l.is_auto_approved("git_push") is True
        l.record_denial("git_push")
        assert l.is_auto_approved("git_push") is False


# ════════════════════════════════════════════════════════════════════════════
# Workflow Engine
# ════════════════════════════════════════════════════════════════════════════

class TestWorkflowEngine:

    def setup_method(self):
        from axoniz.workflows.engine import WorkflowEngine, Workflow, Trigger, Action
        self.Workflow = Workflow
        self.Trigger  = Trigger
        self.Action   = Action
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.engine = WorkflowEngine(db_path=self.tmp.name)

    def teardown_method(self):
        self.engine.stop()
        try: os.unlink(self.tmp.name)
        except Exception: pass

    def test_add_and_list(self):
        wf = self.Workflow(name="test_wf",
                           trigger=self.Trigger(kind="manual"),
                           actions=[self.Action(kind="notify", message="hi")])
        wf_id = self.engine.add_workflow(wf)
        assert any(w.id == wf_id for w in self.engine.list_workflows())

    def test_remove(self):
        wf = self.Workflow(name="removeme", trigger=self.Trigger(kind="manual"), actions=[])
        wf_id = self.engine.add_workflow(wf)
        assert self.engine.remove_workflow(wf_id) is True
        assert not any(w.id == wf_id for w in self.engine.list_workflows())

    def test_enable_disable(self):
        wf = self.Workflow(name="toggle", trigger=self.Trigger(kind="manual"), actions=[])
        wf_id = self.engine.add_workflow(wf)
        self.engine.enable(wf_id, False)
        assert not any(w.id == wf_id for w in self.engine.list_workflows(enabled_only=True))

    def test_shell_action(self):
        wf = self.Workflow(name="shell_wf", trigger=self.Trigger(kind="manual"),
                           actions=[self.Action(kind="shell", command="echo BERU_PHASE7")])
        wf_id = self.engine.add_workflow(wf)
        result = self.engine.run_now(wf_id)
        assert "BERU_PHASE7" in result

    def test_agent_callback(self):
        called = []
        self.engine.set_agent_callback(lambda t: (called.append(t), "ok")[1])
        wf = self.Workflow(name="agent_wf", trigger=self.Trigger(kind="manual"),
                           actions=[self.Action(kind="run_agent", task="do thing")])
        wf_id = self.engine.add_workflow(wf)
        self.engine.run_now(wf_id)
        assert called == ["do thing"]

    def test_status_keys(self):
        s = self.engine.status()
        assert "total_workflows" in s
        assert "running" in s

    def test_format_for_agent(self):
        wf = self.Workflow(name="fmt_wf", trigger=self.Trigger(kind="cron", schedule="08:00"),
                           actions=[])
        self.engine.add_workflow(wf)
        assert "fmt_wf" in self.engine.format_for_agent()


# ════════════════════════════════════════════════════════════════════════════
# Goal Service
# ════════════════════════════════════════════════════════════════════════════

class TestGoalService:

    def setup_method(self):
        from axoniz.goals.service import GoalService
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.gs = GoalService(db_path=self.tmp.name)

    def teardown_method(self):
        try: os.unlink(self.tmp.name)
        except Exception: pass

    def test_create(self):
        g = self.gs.create_goal("Ship v8", deadline="2026-12-31")
        assert g.id and g.title == "Ship v8"

    def test_list(self):
        self.gs.create_goal("A"); self.gs.create_goal("B")
        assert len(self.gs.list_goals()) >= 2

    def test_key_result(self):
        g  = self.gs.create_goal("OKR")
        kr = self.gs.add_key_result(g.id, "KR1", target="done")
        assert kr.goal_id == g.id

    def test_daily_action(self):
        g  = self.gs.create_goal("DA goal")
        kr = self.gs.add_key_result(g.id, "KR")
        da = self.gs.add_daily_action(kr.id, "Do task")
        assert da.id

    def test_update_score(self):
        g = self.gs.create_goal("Score")
        msg = self.gs.update_score(g.id, 0.75)
        assert msg

    def test_complete_action(self):
        g  = self.gs.create_goal("CA")
        kr = self.gs.add_key_result(g.id, "KR")
        da = self.gs.add_daily_action(kr.id, "Act")
        msg = self.gs.complete_action(da.id)
        assert "done" in msg.lower()

    def test_overdue_health_check(self):
        g = self.gs.create_goal("Overdue", deadline="2020-01-01")
        cs = self.gs.health_check()
        assert any(c["id"] == g.id and c["issue"] == "OVERDUE" for c in cs)

    def test_at_risk_health_check(self):
        from datetime import date, timedelta
        dl = (date.today() + timedelta(days=2)).isoformat()
        g  = self.gs.create_goal("AtRisk", deadline=dl)
        cs = self.gs.health_check()
        assert any(c["id"] == g.id for c in cs)

    def test_daily_report_contains_goal(self):
        self.gs.create_goal("Report goal")
        assert "Report goal" in self.gs.daily_report()

    def test_format_goals(self):
        self.gs.create_goal("Fmt goal")
        assert "Fmt goal" in self.gs.format_goals()

    def test_count(self):
        self.gs.create_goal("C1"); self.gs.create_goal("C2")
        assert self.gs.count("active") >= 2

    def test_set_status(self):
        g = self.gs.create_goal("Status")
        self.gs.set_status(g.id, "done")
        assert any(d.id == g.id for d in self.gs.list_goals(status="done"))


# ════════════════════════════════════════════════════════════════════════════
# Awareness Service
# ════════════════════════════════════════════════════════════════════════════

class TestAwarenessService:

    def test_snapshot_no_crash(self):
        from axoniz.awareness.service import AwarenessService
        svc = AwarenessService(interval_s=9999, enable_ocr=False)
        s = svc.snapshot()
        assert hasattr(s, "metrics")

    def test_context_block_is_str(self):
        from axoniz.awareness.service import AwarenessService
        svc = AwarenessService(interval_s=9999)
        assert isinstance(svc.get_context_block(), str)

    def test_suggestion_github(self):
        from axoniz.awareness.service import SuggestionEngine, ContextSnapshot
        snap = ContextSnapshot()
        snap.window_title = "github.com/beru/shadow"
        snap.metrics = {}; snap.clipboard = ""
        sugg = SuggestionEngine().evaluate(snap)
        assert any("github" in s.lower() or "GitHub" in s for s in sugg)

    def test_start_stop(self):
        from axoniz.awareness.service import AwarenessService
        svc = AwarenessService(interval_s=9999)
        svc.start(); assert svc.is_running()
        svc.stop(); time.sleep(0.1); assert not svc.is_running()

    def test_system_metrics_keys(self):
        from axoniz.awareness.service import get_system_metrics
        m = get_system_metrics()
        assert "cpu_percent" in m and "platform" in m


# ════════════════════════════════════════════════════════════════════════════
# Sidecar (offline)
# ════════════════════════════════════════════════════════════════════════════

class TestSidecarOffline:

    def _sc(self):
        from axoniz.sidecar.client import SidecarClient
        return SidecarClient(host="localhost", port=19998, timeout=0.1)

    def test_not_alive(self):
        assert self._sc().is_alive() is False

    def test_get_context_empty(self):
        assert self._sc().get_context() == {}

    def test_context_block_empty(self):
        assert self._sc().context_block() == ""

    def test_notify_false(self):
        assert self._sc().send_notification("x", "y") is False

    def test_status(self):
        s = self._sc().status()
        assert s["alive"] is False and "base_url" in s


# ════════════════════════════════════════════════════════════════════════════
# Dispatcher
# ════════════════════════════════════════════════════════════════════════════

class TestDispatcher:

    def test_send_console(self, capsys):
        from axoniz.comms.dispatcher import Dispatcher
        d = Dispatcher()
        d.send("shadow test", channel="console")
        assert "shadow test" in capsys.readouterr().out

    def test_status_keys(self):
        from axoniz.comms.dispatcher import Dispatcher
        s = Dispatcher().status()
        assert "console" in s and "telegram" in s

    def test_alert_prefix(self, capsys):
        from axoniz.comms.dispatcher import Dispatcher
        Dispatcher().alert("critical")
        assert "critical" in capsys.readouterr().out


# ════════════════════════════════════════════════════════════════════════════
# TTS
# ════════════════════════════════════════════════════════════════════════════

class TestTTS:

    def test_info_keys(self):
        from axoniz.voice.tts import TTSEngine
        info = TTSEngine().info()
        assert "backend" in info and "voice" in info

    def test_print_backend_speaks(self, capsys):
        from axoniz.voice.tts import TTSEngine
        tts = TTSEngine(provider="print")
        assert tts.speak("hello beru") is True
        assert "hello beru" in capsys.readouterr().out

    def test_empty_returns_false(self):
        from axoniz.voice.tts import TTSEngine
        assert TTSEngine(provider="print").speak("") is False

    def test_set_voice(self):
        from axoniz.voice.tts import TTSEngine
        tts = TTSEngine()
        tts.set_voice("en-GB-RyanNeural")
        assert tts.voice == "en-GB-RyanNeural"


# ════════════════════════════════════════════════════════════════════════════
# STT
# ════════════════════════════════════════════════════════════════════════════

class TestSTT:

    def test_wake_words(self):
        from axoniz.voice.stt import STTEngine
        stt = STTEngine()
        assert stt.check_wake_word("hey beru") is True
        assert stt.check_wake_word("shadow monarch rise") is True
        assert stt.check_wake_word("good morning") is False

    def test_info_keys(self):
        from axoniz.voice.stt import STTEngine
        info = STTEngine().info()
        assert "backend" in info and "wake_words" in info

    def test_listen_no_mic_none(self):
        from axoniz.voice.stt import STTEngine
        stt = STTEngine(provider="none")
        assert stt.listen(timeout=0) is None


# ════════════════════════════════════════════════════════════════════════════
# Agent lazy-getter smoke tests
# ════════════════════════════════════════════════════════════════════════════

class TestAgentWiring:

    def test_lazy_getters_no_raise(self):
        import importlib
        ag = importlib.import_module("axoniz.core.agent")
        auth = ag._get_authority()
        wf   = ag._get_workflows()
        aw   = ag._get_awareness()
        tts  = ag._get_tts()
        assert auth is None or hasattr(auth, "check")
        assert wf   is None or hasattr(wf,   "add_workflow")
        assert aw   is None or hasattr(aw,   "snapshot")
        assert tts  is None or hasattr(tts,  "speak")

    def test_tts_offline_none(self):
        import axoniz.core.agent as ag
        orig = ag._tts_engine
        ag._tts_engine = False
        assert ag._get_tts() is None
        ag._tts_engine = orig


# ════════════════════════════════════════════════════════════════════════════
# Enums
# ════════════════════════════════════════════════════════════════════════════

class TestEnums:
    def test_goal_status(self):
        from axoniz.goals.types import GoalStatus
        assert GoalStatus("active") == GoalStatus.ACTIVE
        assert GoalStatus("done")   == GoalStatus.DONE

    def test_goal_priority(self):
        from axoniz.goals.types import GoalPriority
        assert GoalPriority("critical") == GoalPriority.CRITICAL
        assert GoalPriority("low")      == GoalPriority.LOW


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
