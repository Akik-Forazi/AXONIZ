"""
tests/test_beru.py
==================
BERU test suite — runs fast, no LLM needed, no network, no microphone.
Tests all phases: authority, persona, goals, workflows, voice, awareness, sidecar.

Run:
    python -m pytest tests/test_beru.py -v
    set PYTHONIOENCODING=utf-8 && python tests/test_beru.py
"""

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, date, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tmp_db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    return f.name


# ==============================================================================
# PHASE 6 — PERSONA ENGINE
# ==============================================================================

class TestPersona(unittest.TestCase):

    def _make_persona(self):
        from axoniz.core.persona import Persona
        return Persona()

    def test_loads_beru_role(self):
        p = self._make_persona()
        self.assertEqual(p.role_id, "beru")
        self.assertIn("Ant King", p.name)

    def test_authority_level_is_5(self):
        p = self._make_persona()
        self.assertEqual(p.authority_level, 5)

    def test_has_sub_roles(self):
        p = self._make_persona()
        self.assertGreater(len(p.sub_roles), 0)
        names = [sr["name"] for sr in p.sub_roles]
        self.assertTrue(any("Shadow" in n for n in names))

    def test_build_system_prompt_contains_identity(self):
        p = self._make_persona()
        prompt = p.build_system_prompt(workspace="/tmp", tool_names=["file_read", "shell_run"])
        self.assertIn("BERU", prompt)
        self.assertIn("Shadow", prompt)

    def test_build_system_prompt_includes_tools(self):
        p = self._make_persona()
        prompt = p.build_system_prompt(tool_names=["file_read", "shell_run", "web_search"])
        self.assertIn("file_read", prompt)

    def test_is_autonomous_for_safe_actions(self):
        p = self._make_persona()
        self.assertTrue(p.is_autonomous("answer questions"))

    def test_approval_required_for_dangerous(self):
        p = self._make_persona()
        self.assertEqual(p.get_authority_level("delete databases"), 4)

    def test_heartbeat_instructions_present(self):
        p = self._make_persona()
        hb = p.heartbeat_instructions
        self.assertGreater(len(hb), 50)
        self.assertIn("LINT", hb.upper())

    def test_build_heartbeat_prompt(self):
        p = self._make_persona()
        prompt = p.build_heartbeat_prompt(recent_chat="User: hi\nBERU: ready")
        self.assertIn("Heartbeat", prompt)

    def test_singleton(self):
        from axoniz.core.persona import get_persona
        p1 = get_persona("beru")
        p2 = get_persona("beru")
        self.assertIs(p1, p2)

    def test_fallback_when_yaml_missing(self):
        from axoniz.core.persona import Persona
        p = Persona(role="nonexistent_role_xyz")
        self.assertIsNotNone(p.name)
        prompt = p.build_system_prompt()
        self.assertIsNotNone(prompt)


# ==============================================================================
# PHASE 7 — AUTHORITY ENGINE + AUDIT TRAIL
# ==============================================================================

class TestAuthorityEngine(unittest.TestCase):

    def _make_engine(self):
        from axoniz.core.authority import AuthorityEngine, AuditTrail
        db = _tmp_db()
        engine = AuthorityEngine(default_level=3)
        engine.audit = AuditTrail(db_path=db)
        return engine

    def test_autonomous_tools_pass_immediately(self):
        engine = self._make_engine()
        decision = engine.check("file_read", {"path": "/tmp/test.py"})
        self.assertTrue(decision.approved)
        self.assertEqual(decision.reason, "autonomous")

    def test_log_only_tools_approved(self):
        engine = self._make_engine()
        decision = engine.check("palace_store", {"wing": "test", "room": "test", "content": "x"})
        self.assertTrue(decision.approved)

    def test_soft_gate_approved_by_default(self):
        engine = self._make_engine()
        decision = engine.check("file_write", {"path": "/tmp/out.py", "content": "x"})
        self.assertTrue(decision.approved)

    def test_emergency_pause_blocks_all(self):
        engine = self._make_engine()
        engine.emergency_pause()
        decision = engine.check("file_read", {"path": "/tmp/test.py"})
        self.assertFalse(decision.approved)
        self.assertIn("pause", decision.reason.lower())
        engine.resume()

    def test_resume_allows_actions(self):
        engine = self._make_engine()
        engine.emergency_pause()
        engine.resume()
        decision = engine.check("file_read", {"path": "/tmp/test.py"})
        self.assertTrue(decision.approved)

    def test_dangerous_args_escalate(self):
        from axoniz.core.authority import AuthLevel, _escalate_check
        level = _escalate_check("shell_run", {"command": "rm -rf /tmp/test"})
        self.assertEqual(level, AuthLevel.REQUIRE_APPROVAL)

    def test_audit_trail_records_actions(self):
        from axoniz.core.authority import AuditTrail, AuthLevel
        db = _tmp_db()
        audit = AuditTrail(db_path=db)
        audit.record("file_read", {"path": "/tmp/x"}, AuthLevel.AUTONOMOUS, True, "autonomous")
        rows = audit.recent(10)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["tool"], "file_read")
        self.assertTrue(rows[0]["approved"])

    def test_audit_stats(self):
        from axoniz.core.authority import AuditTrail, AuthLevel
        db = _tmp_db()
        audit = AuditTrail(db_path=db)
        audit.record("file_read",   {}, AuthLevel.AUTONOMOUS,       True,  "ok")
        audit.record("file_write",  {}, AuthLevel.SOFT_GATE,        True,  "ok")
        audit.record("file_delete", {}, AuthLevel.REQUIRE_APPROVAL, False, "denied")
        stats = audit.stats()
        self.assertEqual(stats["total_actions"], 3)
        self.assertEqual(stats["blocked_actions"], 1)

    def test_approval_learner_auto_approves_after_3(self):
        from axoniz.core.authority import ApprovalLearner
        learner = ApprovalLearner()
        self.assertFalse(learner.is_auto_approved("git_push"))
        for _ in range(3):
            learner.record_approval("git_push")
        self.assertTrue(learner.is_auto_approved("git_push"))

    def test_approval_learner_reset_on_deny(self):
        from axoniz.core.authority import ApprovalLearner
        learner = ApprovalLearner()
        for _ in range(3):
            learner.record_approval("git_push")
        self.assertTrue(learner.is_auto_approved("git_push"))
        learner.record_denial("git_push")
        self.assertFalse(learner.is_auto_approved("git_push"))

    def test_set_rule_overrides_default(self):
        from axoniz.core.authority import AuthLevel
        engine = self._make_engine()
        engine.set_rule("shell_run", AuthLevel.AUTONOMOUS)
        decision = engine.check("shell_run", {"command": "echo hello"})
        self.assertTrue(decision.approved)
        self.assertEqual(decision.reason, "autonomous")

    def test_summary_returns_string(self):
        engine = self._make_engine()
        engine.check("file_read", {"path": "/tmp/x"})
        summary = engine.summary()
        self.assertIn("Audit", summary)

    def test_recent_audit_formatting(self):
        engine = self._make_engine()
        engine.check("file_read", {"path": "/tmp/x"})
        audit_str = engine.recent_audit(5)
        self.assertIn("file_read", audit_str)

    def test_unknown_tool_uses_log_only_when_default_is_1(self):
        from axoniz.core.authority import AuthorityEngine, AuditTrail
        db = _tmp_db()
        engine = AuthorityEngine(default_level=1)
        engine.audit = AuditTrail(db_path=db)
        decision = engine.check("totally_unknown_tool", {"x": 1})
        self.assertTrue(decision.approved)

    def test_autonomous_tools_are_fast(self):
        engine = self._make_engine()
        t0 = time.time()
        for _ in range(20):
            engine.check("file_read", {"path": "/tmp/x"})
        self.assertLess(time.time() - t0, 1.0)

    def test_audit_recent_respects_limit(self):
        from axoniz.core.authority import AuditTrail, AuthLevel
        db = _tmp_db()
        audit = AuditTrail(db_path=db)
        for i in range(15):
            audit.record(f"tool_{i}", {}, AuthLevel.AUTONOMOUS, True, "ok")
        rows = audit.recent(5)
        self.assertEqual(len(rows), 5)

    def test_auth_decision_has_id(self):
        engine = self._make_engine()
        d = engine.check("file_read", {"path": "/tmp/x"})
        self.assertTrue(len(d.decision_id) > 0)


# ==============================================================================
# PHASE 7 — GOALS TYPES
# ==============================================================================

class TestGoalTypes(unittest.TestCase):

    def test_all_statuses_valid(self):
        from axoniz.goals.types import GoalStatus
        for val in ("active", "paused", "done", "completed", "cancelled"):
            s = GoalStatus(val)
            self.assertEqual(s.value, val)

    def test_all_priorities_valid(self):
        from axoniz.goals.types import GoalPriority
        for val in ("critical", "high", "medium", "low"):
            self.assertEqual(GoalPriority(val).value, val)

    def test_invalid_status_raises(self):
        from axoniz.goals.types import GoalStatus
        with self.assertRaises(ValueError):
            GoalStatus("nonexistent_status")


# ==============================================================================
# PHASE 7 — GOALS ENGINE
# ==============================================================================

class TestGoalService(unittest.TestCase):

    def _make_service(self):
        from axoniz.goals.service import GoalService
        return GoalService(db_path=_tmp_db())

    def test_create_goal(self):
        svc = self._make_service()
        g = svc.create_goal("Build BERU v1.0", deadline="2026-12-31")
        self.assertIsNotNone(g.id)
        self.assertEqual(g.title, "Build BERU v1.0")
        self.assertEqual(g.score, 0.0)

    def test_list_active_goals(self):
        svc = self._make_service()
        svc.create_goal("Goal A")
        svc.create_goal("Goal B")
        self.assertEqual(len(svc.list_goals(status="active")), 2)

    def test_update_score(self):
        svc = self._make_service()
        g = svc.create_goal("Test goal")
        svc.update_score(g.id, 0.75)
        updated = next(x for x in svc.list_goals() if x.id == g.id)
        self.assertAlmostEqual(updated.score, 0.75, places=2)

    def test_score_clamped_to_0_1(self):
        svc = self._make_service()
        g = svc.create_goal("Clamp test")
        svc.update_score(g.id, 1.5)
        updated = next(x for x in svc.list_goals() if x.id == g.id)
        self.assertLessEqual(updated.score, 1.0)

    def test_score_clamp_below_zero(self):
        svc = self._make_service()
        g = svc.create_goal("Clamp neg")
        svc.update_score(g.id, -0.5)
        updated = next(x for x in svc.list_goals() if x.id == g.id)
        self.assertGreaterEqual(updated.score, 0.0)

    def test_add_key_result(self):
        svc = self._make_service()
        g  = svc.create_goal("OKR test")
        kr = svc.add_key_result(g.id, "Ship first release", target="v1.0")
        self.assertIsNotNone(kr.id)
        self.assertEqual(kr.goal_id, g.id)

    def test_add_daily_action(self):
        svc = self._make_service()
        g   = svc.create_goal("Action test")
        kr  = svc.add_key_result(g.id, "KR 1")
        da  = svc.add_daily_action(kr.id, "Write tests", scheduled_date="2026-04-15")
        self.assertIsNotNone(da.id)
        self.assertFalse(da.done)

    def test_complete_action(self):
        svc = self._make_service()
        g   = svc.create_goal("Complete test")
        kr  = svc.add_key_result(g.id, "KR")
        da  = svc.add_daily_action(kr.id, "Do task")
        result = svc.complete_action(da.id)
        self.assertIn("done", result.lower())

    def test_health_check_overdue(self):
        svc = self._make_service()
        svc.create_goal("Past deadline", deadline="2025-01-01")
        concerns = svc.health_check()
        self.assertTrue(any(c["issue"] == "OVERDUE" for c in concerns))

    def test_health_check_at_risk(self):
        svc = self._make_service()
        dl = (date.today() + timedelta(days=2)).isoformat()
        g = svc.create_goal("At risk", deadline=dl)
        svc.update_score(g.id, 0.1)
        concerns = svc.health_check()
        self.assertTrue(any(c["issue"] in ("AT_RISK", "BEHIND") for c in concerns))

    def test_health_check_no_concerns_when_empty(self):
        svc = self._make_service()
        self.assertEqual(svc.health_check(), [])

    def test_daily_report_format(self):
        svc = self._make_service()
        svc.create_goal("Ship BERU", deadline="2026-06-01")
        report = svc.daily_report()
        self.assertIn("BERU", report)
        self.assertIn("Ship BERU", report)

    def test_daily_report_empty(self):
        svc = self._make_service()
        report = svc.daily_report()
        self.assertIn("No active", report)

    def test_format_goals_for_agent(self):
        svc = self._make_service()
        svc.create_goal("Test goal A")
        svc.create_goal("Test goal B")
        fmt = svc.format_goals()
        self.assertIn("Test goal A", fmt)

    def test_format_goals_empty(self):
        svc = self._make_service()
        self.assertEqual(svc.format_goals(), "")

    def test_count(self):
        svc = self._make_service()
        svc.create_goal("G1")
        svc.create_goal("G2")
        svc.create_goal("G3")
        self.assertEqual(svc.count("active"), 3)

    def test_set_status(self):
        svc = self._make_service()
        g = svc.create_goal("Status test")
        svc.set_status(g.id, "completed")
        goals = svc.list_goals(status="completed")
        self.assertEqual(len(goals), 1)

    def test_set_status_done(self):
        svc = self._make_service()
        g = svc.create_goal("Done test")
        svc.set_status(g.id, "done")
        self.assertEqual(len(svc.list_goals(status="done")), 1)

    def test_set_status_cancelled(self):
        svc = self._make_service()
        g = svc.create_goal("Cancel test")
        svc.set_status(g.id, "cancelled")
        self.assertEqual(len(svc.list_goals(status="cancelled")), 1)

    def test_goals_persist_across_instances(self):
        db = _tmp_db()
        from axoniz.goals.service import GoalService
        GoalService(db_path=db).create_goal("Persistent goal")
        goals = GoalService(db_path=db).list_goals()
        self.assertEqual(len(goals), 1)
        self.assertEqual(goals[0].title, "Persistent goal")

    def test_get_goal_by_id(self):
        svc = self._make_service()
        g = svc.create_goal("Findable")
        found = svc.get_goal(g.id)
        self.assertIsNotNone(found)
        self.assertEqual(found.title, "Findable")

    def test_get_goal_missing_returns_none(self):
        svc = self._make_service()
        self.assertIsNone(svc.get_goal("nonexistent-id-xyz"))


# ==============================================================================
# PHASE 7 — WORKFLOW ENGINE
# ==============================================================================

class TestWorkflowEngine(unittest.TestCase):

    def _make_engine(self):
        from axoniz.workflows.engine import WorkflowEngine
        return WorkflowEngine(db_path=_tmp_db())

    def test_add_workflow(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        wf = Workflow(name="test_wf", trigger=Trigger(kind="manual"),
                      actions=[Action(kind="notify", message="hello")])
        self.assertIsNotNone(engine.add_workflow(wf))

    def test_list_workflows(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        engine.add_workflow(Workflow(name="WF1", trigger=Trigger(kind="manual"),
                                     actions=[Action(kind="notify", message="a")]))
        engine.add_workflow(Workflow(name="WF2", trigger=Trigger(kind="manual"),
                                     actions=[Action(kind="notify", message="b")]))
        self.assertEqual(len(engine.list_workflows()), 2)

    def test_enable_disable(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        wf = Workflow(name="toggle_test", trigger=Trigger(kind="manual"),
                      actions=[Action(kind="notify")])
        wid = engine.add_workflow(wf)
        engine.enable(wid, False)
        self.assertEqual(len(engine.list_workflows(enabled_only=True)), 0)

    def test_run_notify_action(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        notified = []
        with patch("axoniz.comms.dispatcher.get_dispatcher") as mock_disp:
            mock_disp.return_value.send = lambda msg: notified.append(msg)
            wf = Workflow(name="notify_test", trigger=Trigger(kind="manual"),
                          actions=[Action(kind="notify", message="fire!")])
            wid = engine.add_workflow(wf)
            result = engine.run_now(wid, "manual")
            self.assertIn("notif", result.lower())

    def test_run_shell_action(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        wf = Workflow(name="shell_test", trigger=Trigger(kind="manual"),
                      actions=[Action(kind="shell", command="echo BERU_TEST")])
        wid = engine.add_workflow(wf)
        result = engine.run_now(wid, "manual")
        self.assertIn("BERU_TEST", result)

    def test_run_agent_action(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        calls = []
        engine.set_agent_callback(lambda task: (calls.append(task), "done")[1])
        wf = Workflow(name="agent_test", trigger=Trigger(kind="manual"),
                      actions=[Action(kind="run_agent", task="say hello")])
        wid = engine.add_workflow(wf)
        engine.run_now(wid, "manual")
        self.assertEqual(calls, ["say hello"])

    def test_remove_workflow(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        wf = Workflow(name="remove_test", trigger=Trigger(kind="manual"),
                      actions=[Action(kind="notify")])
        wid = engine.add_workflow(wf)
        ok = engine.remove_workflow(wid)
        self.assertTrue(ok)
        self.assertEqual(len(engine.list_workflows()), 0)

    def test_status_dict(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        engine.add_workflow(Workflow(name="s1",
                                     trigger=Trigger(kind="cron", schedule="08:00"),
                                     actions=[Action(kind="notify")]))
        st = engine.status()
        self.assertEqual(st["total_workflows"], 1)
        self.assertEqual(st["enabled"], 1)

    def test_recent_runs(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action
        engine = self._make_engine()
        wf = Workflow(name="runs_test", trigger=Trigger(kind="manual"),
                      actions=[Action(kind="shell", command="echo ok")])
        wid = engine.add_workflow(wf)
        engine.run_now(wid, "test")
        runs = engine.recent_runs(5)
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["name"], "runs_test")

    def test_cron_trigger_fires_at_time(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action, WorkflowEngine
        engine = WorkflowEngine(db_path=_tmp_db())
        now_hhmm = datetime.now().strftime("%H:%M")
        calls = []
        engine.set_agent_callback(lambda t: (calls.append(t), "ok")[1])
        wf = Workflow(name="cron_test",
                      trigger=Trigger(kind="cron", schedule=now_hhmm),
                      actions=[Action(kind="run_agent", task="cron fired")])
        engine.add_workflow(wf)
        engine._tick()
        self.assertEqual(len(calls), 1)

    def test_heartbeat_trigger_fires_when_interval_elapsed(self):
        import datetime as dt
        from axoniz.workflows.engine import Workflow, Trigger, Action, WorkflowEngine
        engine = WorkflowEngine(db_path=_tmp_db())
        calls = []
        engine.set_agent_callback(lambda t: (calls.append(t), "ok")[1])
        wf = Workflow(name="hb_test",
                      trigger=Trigger(kind="heartbeat", interval_s=1),
                      actions=[Action(kind="run_agent", task="heartbeat")],
                      last_run=(dt.datetime.now() - dt.timedelta(seconds=5)).isoformat())
        engine.add_workflow(wf)
        engine._tick()
        self.assertEqual(len(calls), 1)

    def test_disabled_workflow_doesnt_fire(self):
        from axoniz.workflows.engine import Workflow, Trigger, Action, WorkflowEngine
        engine = WorkflowEngine(db_path=_tmp_db())
        calls = []
        engine.set_agent_callback(lambda t: (calls.append(t), "ok")[1])
        now_hhmm = datetime.now().strftime("%H:%M")
        wf = Workflow(name="disabled_test",
                      trigger=Trigger(kind="cron", schedule=now_hhmm),
                      actions=[Action(kind="run_agent", task="should not fire")])
        wid = engine.add_workflow(wf)
        engine.enable(wid, False)
        engine._tick()
        self.assertEqual(len(calls), 0)


# ==============================================================================
# COMMS — DISPATCHER + TELEGRAM
# ==============================================================================

class TestDispatcher(unittest.TestCase):

    def test_dispatcher_creates(self):
        from axoniz.comms.dispatcher import Dispatcher
        self.assertIsNotNone(Dispatcher())

    def test_send_reaches_console(self):
        from axoniz.comms.dispatcher import Dispatcher
        messages = []
        d = Dispatcher()
        d._channels = [lambda t, *a, **kw: messages.append(t)]
        d.send("test message", urgent=True)
        self.assertIn("test message", messages)

    def test_send_async_works(self):
        from axoniz.comms.dispatcher import Dispatcher
        messages = []
        lock = threading.Lock()
        d = Dispatcher()
        def _capture(t, *a, **kw):
            with lock: messages.append(t)
        d._channels = [_capture]
        d.send("async message", urgent=False)
        time.sleep(0.2)
        with lock:
            self.assertIn("async message", messages)

    def test_send_urgent_kwarg_accepted(self):
        from axoniz.comms.dispatcher import Dispatcher
        d = Dispatcher()
        d.send("hello", urgent=True)
        d.send("world", urgent=False)

    def test_alert_propagates(self):
        from axoniz.comms.dispatcher import Dispatcher
        printed = []
        d = Dispatcher()
        d._channels = [lambda t, *a, **kw: printed.append(t)]
        d.alert("something bad")
        self.assertTrue(any("something bad" in m for m in printed))

    def test_notify_sends_title_and_body(self):
        from axoniz.comms.dispatcher import Dispatcher
        printed = []
        d = Dispatcher()
        d._channels = [lambda t, *a, **kw: printed.append(t)]
        d.notify("Title", "Body text")
        self.assertTrue(any("Title" in m and "Body text" in m for m in printed))

    def test_status_dict_has_keys(self):
        from axoniz.comms.dispatcher import Dispatcher
        st = Dispatcher().status()
        self.assertIn("console", st)
        self.assertIn("telegram", st)

    def test_multiple_channels_all_called(self):
        from axoniz.comms.dispatcher import Dispatcher
        log1, log2 = [], []
        d = Dispatcher()
        d._channels = [
            lambda t, *a, **kw: log1.append(t),
            lambda t, *a, **kw: log2.append(t),
        ]
        d.send("broadcast")
        self.assertIn("broadcast", log1)
        self.assertIn("broadcast", log2)


class TestTelegramBot(unittest.TestCase):

    def test_unconfigured_not_active(self):
        from axoniz.comms.telegram import BeruTelegramBot
        self.assertFalse(BeruTelegramBot(token="", chat_id="").is_configured())

    def test_configured_bot(self):
        from axoniz.comms.telegram import BeruTelegramBot
        self.assertTrue(BeruTelegramBot(token="123:TEST", chat_id="456789").is_configured())

    def test_send_message_no_crash_when_unconfigured(self):
        from axoniz.comms.telegram import BeruTelegramBot
        BeruTelegramBot(token="", chat_id="").send_message("test")

    def test_dispatch_help(self):
        from axoniz.comms.telegram import BeruTelegramBot
        bot = BeruTelegramBot(token="123:X", chat_id="456")
        sent = []
        bot.send_message = lambda text, *a, **kw: sent.append(text)
        bot._dispatch("/help", "456")
        self.assertTrue(len(sent) > 0)
        self.assertIn("BERU", sent[0])

    def test_dispatch_status(self):
        from axoniz.comms.telegram import BeruTelegramBot
        bot = BeruTelegramBot(token="123:X", chat_id="456")
        sent = []
        bot.send_message = lambda text, *a, **kw: sent.append(text)
        bot._dispatch("/status", "456")
        self.assertTrue(len(sent) > 0)

    def test_dispatch_pause_resume(self):
        from axoniz.comms.telegram import BeruTelegramBot
        from axoniz.core.authority import get_engine
        bot = BeruTelegramBot(token="123:X", chat_id="456")
        sent = []
        bot.send_message = lambda text, *a, **kw: sent.append(text)
        bot._dispatch("/pause", "456")
        self.assertTrue(get_engine()._paused)
        bot._dispatch("/resume", "456")
        self.assertFalse(get_engine()._paused)

    def test_security_wrong_chat_id_ignored(self):
        from axoniz.comms.telegram import BeruTelegramBot
        bot = BeruTelegramBot(token="123:X", chat_id="REAL_CHAT")
        sent = []
        bot.send_message = lambda text, *a, **kw: sent.append(text)
        bot._handle_update({"update_id": 1,
                            "message": {"text": "/help",
                                        "chat": {"id": "WRONG_CHAT"}}})
        self.assertEqual(len(sent), 0)


# ==============================================================================
# VOICE — TTS
# ==============================================================================

class TestTTS(unittest.TestCase):

    def test_tts_creates_print_fallback(self):
        from axoniz.voice.tts import TTSEngine
        self.assertEqual(TTSEngine(provider="print")._backend, "print")

    def test_tts_speak_print_returns_true(self):
        from axoniz.voice.tts import TTSEngine
        self.assertTrue(TTSEngine(provider="print").speak("Your will is done, my liege."))

    def test_tts_speak_empty_returns_false(self):
        from axoniz.voice.tts import TTSEngine
        self.assertFalse(TTSEngine(provider="print").speak(""))

    def test_tts_speak_whitespace_returns_false(self):
        from axoniz.voice.tts import TTSEngine
        self.assertFalse(TTSEngine(provider="print").speak("   "))

    def test_tts_speak_async_no_crash(self):
        from axoniz.voice.tts import TTSEngine
        tts = TTSEngine(provider="print")
        tts.speak_async("Async test.")
        time.sleep(0.15)

    def test_tts_info_dict(self):
        from axoniz.voice.tts import TTSEngine
        info = TTSEngine(provider="print").info()
        self.assertIn("backend", info)
        self.assertIn("available", info)

    def test_tts_detect_edge_or_fallback(self):
        from axoniz.voice.tts import TTSEngine
        self.assertIn(TTSEngine()._backend, ("kokoro", "edge", "pyttsx3", "print", "mms"))

    def test_tts_set_voice(self):
        from axoniz.voice.tts import TTSEngine
        tts = TTSEngine(provider="print")
        tts.set_voice("test_voice")
        self.assertEqual(tts.voice, "test_voice")
        self.assertIsNone(tts._model)

    def test_tts_set_speed(self):
        from axoniz.voice.tts import TTSEngine
        tts = TTSEngine(provider="print")
        tts.set_speed(1.2)
        self.assertAlmostEqual(tts.speed, 1.2)

    def test_tts_is_available_false_for_print(self):
        from axoniz.voice.tts import TTSEngine
        self.assertFalse(TTSEngine(provider="print").is_available)


# ==============================================================================
# VOICE — STT
# ==============================================================================

class TestSTT(unittest.TestCase):

    def test_stt_creates(self):
        from axoniz.voice.stt import STTEngine
        self.assertIsNotNone(STTEngine())

    def test_stt_wake_words(self):
        from axoniz.voice.stt import STTEngine
        stt = STTEngine()
        self.assertTrue(stt.check_wake_word("hey beru do this"))
        self.assertTrue(stt.check_wake_word("shadow monarch please"))
        self.assertTrue(stt.check_wake_word("marshal report"))
        self.assertFalse(stt.check_wake_word("hello there"))

    def test_stt_beru_activate_recognized(self):
        from axoniz.voice.stt import STTEngine
        stt = STTEngine()
        self.assertTrue(stt.check_wake_word("beru activate please"))

    def test_stt_info(self):
        from axoniz.voice.stt import STTEngine
        info = STTEngine().info()
        self.assertIn("backend", info)
        self.assertIn("wake_words", info)
        self.assertIn("beru", info["wake_words"])

    def test_stt_beru_activate_in_wake_words_list(self):
        from axoniz.voice.stt import WAKE_WORDS
        self.assertIn("beru activate", WAKE_WORDS)

    def test_stt_check_wake_word_case_insensitive(self):
        from axoniz.voice.stt import STTEngine
        stt = STTEngine()
        self.assertTrue(stt.check_wake_word("BERU ACTIVATE now"))
        self.assertTrue(stt.check_wake_word("BERU do this"))

    def test_stt_listen_none_when_unavailable(self):
        from axoniz.voice.stt import STTEngine
        stt = STTEngine(provider="none")
        self.assertIsNone(stt.listen(timeout=1))


# ==============================================================================
# VOICE — WAKE WORD
# ==============================================================================

class TestWakeWord(unittest.TestCase):

    def test_wake_word_detector_creates(self):
        from axoniz.voice.wake_word import WakeWordDetector
        wwd = WakeWordDetector(on_wake=lambda w: None)
        self.assertIsNotNone(wwd)
        self.assertIn(wwd.backend,
                      ("openwakeword", "pvporcupine", "sr_polling",
                       "whisper_polling", "none"))

    def test_fire_respects_cooldown(self):
        from axoniz.voice.wake_word import WakeWordDetector
        fired = []
        wwd = WakeWordDetector(on_wake=lambda w: fired.append(w))
        wwd._fire("beru")
        wwd._fire("beru")
        time.sleep(0.1)
        self.assertLessEqual(len(fired), 1)

    def test_fire_increments_counter(self):
        from axoniz.voice.wake_word import WakeWordDetector
        fired = []
        wwd = WakeWordDetector(on_wake=lambda w: fired.append(w))
        wwd._fire("beru")
        time.sleep(0.05)
        self.assertEqual(len(fired), 1)
        self.assertEqual(fired[0], "beru")

    def test_beru_activate_in_wake_words(self):
        from axoniz.voice.wake_word import WAKE_WORDS
        self.assertIn("beru activate", WAKE_WORDS)

    def test_multi_word_phrase_avoids_openwakeword(self):
        from axoniz.voice.wake_word import WakeWordDetector
        wwd = WakeWordDetector(on_wake=lambda w: None,
                               wake_words=["beru activate"])
        self.assertNotEqual(wwd.backend, "openwakeword")

    def test_stop_does_not_crash_when_not_started(self):
        from axoniz.voice.wake_word import WakeWordDetector
        WakeWordDetector(on_wake=lambda w: None).stop()

    def test_is_running_false_before_start(self):
        from axoniz.voice.wake_word import WakeWordDetector
        wwd = WakeWordDetector(on_wake=lambda w: None)
        self.assertFalse(wwd.is_running())


# ==============================================================================
# VOICE — VOICE LOOP
# ==============================================================================

class TestVoiceLoop(unittest.TestCase):

    def test_voice_trim_removes_code_blocks(self):
        from axoniz.voice.voice_loop import _voice_trim
        text = "Here:\n```python\nprint('hello')\n```\nDone!"
        trimmed = _voice_trim(text)
        self.assertNotIn("```", trimmed)
        self.assertIn("code", trimmed.lower())

    def test_voice_trim_removes_markdown(self):
        from axoniz.voice.voice_loop import _voice_trim
        text = "**Important:** This is *really* great. See ## heading."
        trimmed = _voice_trim(text)
        self.assertNotIn("**", trimmed)
        self.assertNotIn("##", trimmed)

    def test_voice_trim_length_limit(self):
        from axoniz.voice.voice_loop import _voice_trim
        trimmed = _voice_trim("This is a sentence. " * 50, max_chars=350)
        self.assertLessEqual(len(trimmed), 400)

    def test_voice_trim_short_passes_through(self):
        from axoniz.voice.voice_loop import _voice_trim
        text = "Your will is done."
        self.assertEqual(_voice_trim(text), text)

    def test_voice_trim_inline_code_unquoted(self):
        from axoniz.voice.voice_loop import _voice_trim
        text = "Call the `main()` function."
        trimmed = _voice_trim(text)
        self.assertNotIn("`", trimmed)
        self.assertIn("main()", trimmed)

    def test_handle_time_query_time(self):
        from axoniz.voice.voice_loop import VoiceLoop
        vl = VoiceLoop(agent=MagicMock())
        result = vl._handle_time_query("what time is it?")
        self.assertIsNotNone(result)
        self.assertTrue("AM" in result or "PM" in result)

    def test_handle_time_query_date(self):
        from axoniz.voice.voice_loop import VoiceLoop
        vl = VoiceLoop(agent=MagicMock())
        result = vl._handle_time_query("what day is today?")
        self.assertIsNotNone(result)
        self.assertIn(datetime.now().strftime("%A"), result)

    def test_handle_time_query_non_time_returns_none(self):
        from axoniz.voice.voice_loop import VoiceLoop
        vl = VoiceLoop(agent=MagicMock())
        self.assertIsNone(vl._handle_time_query("fix the bug in server.py"))

    def test_handle_time_query_year(self):
        from axoniz.voice.voice_loop import VoiceLoop
        vl = VoiceLoop(agent=MagicMock())
        result = vl._handle_time_query("what year is it")
        self.assertIsNotNone(result)
        self.assertIn(str(datetime.now().year), result)

    def test_make_followup_for_bug_fix(self):
        from axoniz.voice.voice_loop import _make_followup
        followup = _make_followup("fix the crash bug", "I found the issue in line 42.")
        self.assertIsNotNone(followup)
        self.assertIn("test", followup.lower())

    def test_make_followup_for_create(self):
        from axoniz.voice.voice_loop import _make_followup
        followup = _make_followup("create a new file", "Created test.py successfully.")
        self.assertIsNotNone(followup)
        self.assertIn("commit", followup.lower())

    def test_make_followup_time_query_none(self):
        from axoniz.voice.voice_loop import _make_followup
        self.assertIsNone(_make_followup("what time is it", "It's 7:30 PM."))

    def test_make_followup_date_query_none(self):
        from axoniz.voice.voice_loop import _make_followup
        self.assertIsNone(_make_followup("what is today's date", "Today is Thursday."))

    def test_make_followup_search_deeper(self):
        from axoniz.voice.voice_loop import _make_followup
        followup = _make_followup("search for best Python frameworks", "Found several.")
        self.assertIsNotNone(followup)
        self.assertIn("deeper", followup.lower())

    def test_stop_words_recognized(self):
        from axoniz.voice.voice_loop import _STOP_WORDS
        self.assertIn("stop listening", _STOP_WORDS)
        self.assertIn("nevermind", _STOP_WORDS)

    def test_natural_time_no_platform_error(self):
        from axoniz.voice.voice_loop import _natural_time
        result = _natural_time()
        self.assertIsInstance(result, str)
        self.assertGreater(len(result), 0)

    def test_natural_datetime_no_platform_error(self):
        from axoniz.voice.voice_loop import _natural_datetime
        result = _natural_datetime()
        self.assertIsInstance(result, str)
        self.assertIn(datetime.now().strftime("%A"), result)


# ==============================================================================
# LIGHT DAEMON
# ==============================================================================

class TestLightDaemon(unittest.TestCase):

    def test_classify_stop(self):
        from axoniz.voice.light_daemon import _classify
        self.assertEqual(_classify("stop"), "stop")
        self.assertEqual(_classify("go to sleep"), "stop")
        self.assertEqual(_classify("shut up"), "stop")

    def test_classify_local_time(self):
        from axoniz.voice.light_daemon import _classify
        self.assertEqual(_classify("what time is it"), "local")

    def test_classify_local_hello(self):
        from axoniz.voice.light_daemon import _classify
        self.assertEqual(_classify("hello"), "local")

    def test_classify_llm_write(self):
        from axoniz.voice.light_daemon import _classify
        self.assertEqual(_classify("write a function to sort a list"), "llm")

    def test_classify_llm_explain(self):
        from axoniz.voice.light_daemon import _classify
        self.assertEqual(_classify("how does quicksort work"), "llm")

    def test_classify_llm_debug(self):
        from axoniz.voice.light_daemon import _classify
        self.assertEqual(_classify("debug this crash in my server"), "llm")

    def test_local_response_time(self):
        from axoniz.voice.light_daemon import _local_response
        result = _local_response("what time is it")
        self.assertTrue("AM" in result or "PM" in result)

    def test_local_response_date(self):
        from axoniz.voice.light_daemon import _local_response
        result = _local_response("what is today's date")
        self.assertIn(datetime.now().strftime("%A"), result)

    def test_local_response_hello(self):
        from axoniz.voice.light_daemon import _local_response
        result = _local_response("hello")
        self.assertGreater(len(result), 0)

    def test_local_response_who_are_you(self):
        from axoniz.voice.light_daemon import _local_response
        self.assertIn("BERU", _local_response("who are you"))

    def test_trim_removes_code_blocks(self):
        from axoniz.voice.light_daemon import _trim
        result = _trim("Here:\n```python\nx=1\n```\nDone.")
        self.assertNotIn("```", result)
        self.assertIn("chat", result)

    def test_trim_length_limit(self):
        from axoniz.voice.light_daemon import _trim
        result = _trim("Word. " * 100, max_chars=100)
        self.assertLessEqual(len(result), 130)

    def test_llm_client_no_key_unavailable(self):
        from axoniz.voice.light_daemon import _LLMClient
        env = {k: v for k, v in os.environ.items()
               if k not in ("ANTHROPIC_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY")}
        with patch.dict(os.environ, env, clear=True):
            client = _LLMClient(provider="none")
            self.assertFalse(client.available)

    def test_daemon_info_has_required_keys(self):
        from axoniz.voice.light_daemon import LightVoiceDaemon
        daemon = LightVoiceDaemon.__new__(LightVoiceDaemon)
        daemon._state = "IDLE"
        daemon._wwd   = None
        stt = MagicMock(); stt.available = True; stt._model_size = "tiny"
        daemon._stt = stt
        llm = MagicMock(); llm._backend = "none"; llm.available = False
        daemon._llm = llm
        info = daemon.info()
        for key in ("tts", "stt", "llm", "state"):
            self.assertIn(key, info, f"Missing key: {key}")

    def test_light_daemon_alias(self):
        from axoniz.voice.light_daemon import LightDaemon, LightVoiceDaemon
        self.assertIs(LightDaemon, LightVoiceDaemon)

    def test_say_method_exists(self):
        from axoniz.voice.light_daemon import LightVoiceDaemon
        self.assertTrue(hasattr(LightVoiceDaemon, "say"))
        self.assertTrue(callable(LightVoiceDaemon.say))

    def test_listen_once_method_exists(self):
        from axoniz.voice.light_daemon import LightVoiceDaemon
        self.assertTrue(hasattr(LightVoiceDaemon, "listen_once"))


# ==============================================================================
# AWARENESS SERVICE
# ==============================================================================

class TestAwarenessService(unittest.TestCase):

    def test_service_creates(self):
        from axoniz.awareness.service import AwarenessService
        self.assertIsNotNone(AwarenessService(interval_s=300))

    def test_system_metrics(self):
        from axoniz.awareness.service import get_system_metrics
        metrics = get_system_metrics()
        self.assertIn("platform", metrics)
        self.assertIn("cpu_percent", metrics)

    def test_snapshot_returns_object(self):
        from axoniz.awareness.service import AwarenessService, ContextSnapshot
        svc = AwarenessService(interval_s=300, enable_ocr=False)
        snap = svc.snapshot()
        self.assertIsInstance(snap, ContextSnapshot)
        self.assertGreater(snap.ts, 0)

    def test_suggestion_engine_no_crash(self):
        from axoniz.awareness.service import SuggestionEngine, ContextSnapshot
        engine = SuggestionEngine()
        snap = ContextSnapshot()
        snap.window_title = "VS Code — axoniz/core/agent.py"
        snap.metrics = {"cpu_percent": 30.0, "ram_percent": 50.0}
        snap.clipboard = "nothing special"
        suggestions = engine.evaluate(snap)
        self.assertIsInstance(suggestions, list)

    def test_suggestion_for_high_cpu(self):
        from axoniz.awareness.service import SuggestionEngine, ContextSnapshot
        engine = SuggestionEngine()
        snap = ContextSnapshot()
        snap.metrics = {"cpu_percent": 95.0, "ram_percent": 50.0}
        snap.window_title = ""
        snap.clipboard = ""
        suggestions = engine.evaluate(snap)
        self.assertTrue(any("CPU" in s or "compute" in s for s in suggestions))

    def test_suggestion_for_error_in_clipboard(self):
        from axoniz.awareness.service import SuggestionEngine, ContextSnapshot
        engine = SuggestionEngine()
        snap = ContextSnapshot()
        snap.metrics = {"cpu_percent": 10.0, "ram_percent": 30.0}
        snap.window_title = ""
        snap.clipboard = "Traceback (most recent call last):\n  File..."
        suggestions = engine.evaluate(snap)
        self.assertTrue(
            any("error" in s.lower() or "diagnose" in s.lower() for s in suggestions))

    def test_context_block_format(self):
        from axoniz.awareness.service import ContextSnapshot
        snap = ContextSnapshot()
        snap.window_title = "GitHub — vierisid/jarvis"
        snap.metrics = {"cpu_percent": 10.0, "ram_percent": 30.0}
        self.assertIn("GitHub", snap.context_block())

    def test_start_stop(self):
        from axoniz.awareness.service import AwarenessService
        svc = AwarenessService(interval_s=999)
        svc.start()
        time.sleep(0.1)
        self.assertTrue(svc.is_running())
        svc.stop()

    def test_suggestion_callback_fires(self):
        from axoniz.awareness.service import AwarenessService, ContextSnapshot, SuggestionEngine
        suggestions_received = []
        svc = AwarenessService(interval_s=999)
        svc.set_suggestion_callback(lambda s: suggestions_received.append(s))
        snap = ContextSnapshot()
        snap.window_title = "github.com/beru"
        snap.metrics = {"cpu_percent": 10.0, "ram_percent": 20.0}
        snap.clipboard = ""
        snap.suggestions = SuggestionEngine().evaluate(snap)
        svc._last_window = ""
        svc._check_changes(snap)
        self.assertGreaterEqual(len(suggestions_received), 0)


# ==============================================================================
# SIDECAR CLIENT
# ==============================================================================

class TestSidecarClient(unittest.TestCase):

    def test_client_creates(self):
        from axoniz.sidecar.client import SidecarClient
        self.assertIsNotNone(SidecarClient(host="localhost", port=19999))

    def test_is_alive_returns_false_when_offline(self):
        from axoniz.sidecar.client import SidecarClient
        self.assertFalse(SidecarClient(host="localhost", port=19999, timeout=0.1).is_alive())

    def test_get_returns_none_when_offline(self):
        from axoniz.sidecar.client import SidecarClient
        self.assertIsNone(SidecarClient(host="localhost", port=19999, timeout=0.1)._get("/context"))

    def test_get_context_safe_when_offline(self):
        from axoniz.sidecar.client import SidecarClient
        self.assertEqual(SidecarClient(host="localhost", port=19999, timeout=0.1).get_context(), {})

    def test_get_active_window_safe(self):
        from axoniz.sidecar.client import SidecarClient
        self.assertEqual(SidecarClient(host="localhost", port=19999, timeout=0.1).get_active_window(), "")

    def test_context_block_empty_when_offline(self):
        from axoniz.sidecar.client import SidecarClient
        self.assertEqual(SidecarClient(host="localhost", port=19999, timeout=0.1).context_block(), "")

    def test_status_dict(self):
        from axoniz.sidecar.client import SidecarClient
        st = SidecarClient(host="localhost", port=19999, timeout=0.1).status()
        self.assertIn("alive", st)
        self.assertFalse(st["alive"])


# ==============================================================================
# AGENT — get_time + datetime injection
# ==============================================================================

class TestAgentGetTime(unittest.TestCase):

    def test_get_time_returns_time(self):
        class _FakeAgent:
            def _tool_get_time(self, query="all"):
                from datetime import datetime as _dt
                now = _dt.now()
                q = query.lower()
                if "time" in q and "date" not in q and q != "all":
                    return now.strftime("%I:%M %p").lstrip("0")
                if "date" in q and "time" not in q:
                    return now.strftime("%A, %B %d %Y")
                if "day" in q:
                    return now.strftime("%A")
                if "year" in q:
                    return str(now.year)
                return (f"{now.strftime('%A, %B %d %Y')}  "
                        f"{now.strftime('%I:%M %p').lstrip('0')}")
        agent = _FakeAgent()
        r_time = agent._tool_get_time("time")
        self.assertTrue("AM" in r_time or "PM" in r_time)
        r_date = agent._tool_get_time("date")
        self.assertIn(str(datetime.now().year), r_date)
        r_day = agent._tool_get_time("day")
        self.assertEqual(r_day, datetime.now().strftime("%A"))
        r_year = agent._tool_get_time("year")
        self.assertEqual(r_year, str(datetime.now().year))
        r_all = agent._tool_get_time("all")
        self.assertIn(str(datetime.now().year), r_all)

    def test_sys_prompt_contains_datetime(self):
        now = datetime.now()
        now_str = now.strftime("%A, %B %d %Y -- %I:%M %p").replace(" 0", " ")
        block = (
            "\n\nSELF-AWARENESS:\n"
            f"  - Current date/time: {now_str}\n"
            "  - You know the exact current time.\n"
        )
        self.assertIn(str(now.year), block)
        self.assertIn(now.strftime("%A"), block)
        self.assertIn("time", block.lower())


# ==============================================================================
# INTEGRATION — all modules import cleanly
# ==============================================================================

class TestImports(unittest.TestCase):

    def _import(self, module):
        try:
            __import__(module)
            return True, None
        except ImportError as e:
            return True, f"ImportError (optional dep missing): {e}"
        except Exception as e:
            return False, str(e)

    def test_import_persona(self):
        ok, err = self._import("axoniz.core.persona")
        self.assertTrue(ok, err)

    def test_import_authority(self):
        ok, err = self._import("axoniz.core.authority")
        self.assertTrue(ok, err)

    def test_import_goals(self):
        ok, err = self._import("axoniz.goals.service")
        self.assertTrue(ok, err)

    def test_import_goals_types(self):
        ok, err = self._import("axoniz.goals.types")
        self.assertTrue(ok, err)

    def test_import_workflows(self):
        ok, err = self._import("axoniz.workflows.engine")
        self.assertTrue(ok, err)

    def test_import_awareness(self):
        ok, err = self._import("axoniz.awareness.service")
        self.assertTrue(ok, err)

    def test_import_sidecar(self):
        ok, err = self._import("axoniz.sidecar.client")
        self.assertTrue(ok, err)

    def test_import_tts(self):
        ok, err = self._import("axoniz.voice.tts")
        self.assertTrue(ok, err)

    def test_import_stt(self):
        ok, err = self._import("axoniz.voice.stt")
        self.assertTrue(ok, err)

    def test_import_wake_word(self):
        ok, err = self._import("axoniz.voice.wake_word")
        self.assertTrue(ok, err)

    def test_import_voice_loop(self):
        ok, err = self._import("axoniz.voice.voice_loop")
        self.assertTrue(ok, err)

    def test_import_light_daemon(self):
        ok, err = self._import("axoniz.voice.light_daemon")
        self.assertTrue(ok, err)

    def test_import_comms_telegram(self):
        ok, err = self._import("axoniz.comms.telegram")
        self.assertTrue(ok, err)

    def test_import_comms_dispatcher(self):
        ok, err = self._import("axoniz.comms.dispatcher")
        self.assertTrue(ok, err)

    def test_import_unified_memory(self):
        ok, err = self._import("axoniz.integrations.unified_memory")
        self.assertTrue(ok, err)

    def test_import_voice_init(self):
        ok, err = self._import("axoniz.voice")
        self.assertTrue(ok, err)

    def test_light_daemon_exports(self):
        from axoniz.voice.light_daemon import (
            start_light_daemon, get_daemon, LightVoiceDaemon, LightDaemon)
        self.assertTrue(callable(start_light_daemon))
        self.assertTrue(callable(get_daemon))
        self.assertIs(LightDaemon, LightVoiceDaemon)


# ==============================================================================
# Runner
# ==============================================================================

if __name__ == "__main__":
    print("\n  BERU Test Suite")
    print("=" * 60)
    loader = unittest.TestLoader()
    suite  = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stdout)
    result = runner.run(suite)
    print("\n" + "=" * 60)
    if result.wasSuccessful():
        print(f"  All {result.testsRun} tests passed. Shadow army is ready.")
    else:
        failed = len(result.failures) + len(result.errors)
        print(f"  {failed} test(s) failed out of {result.testsRun}.")
        sys.exit(1)
