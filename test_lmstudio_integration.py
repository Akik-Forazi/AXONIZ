#!/usr/bin/env python3
"""
LM Studio Backend Integration Test
Run against a real LM Studio server to verify complete lifecycle.

Usage:
    python test_lmstudio_integration.py [--url http://localhost:1233]
"""

import argparse
import json
import sys
import time
import traceback
from axoniz.core.backend import LMStudioBackend, get_backend, list_supported_providers


def banner(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def report(name, ok, detail=""):
    status = "✅ PASS" if ok else "❌ FAIL"
    print(f"  {status}  {name}")
    if detail:
        print(f"        → {detail}")
    return ok


def run_all_tests(base_url: str, model_name: str = "", auto_load: bool = False):
    passed = 0
    failed = 0

    banner("LM Studio Backend Integration Tests")
    print(f"  Target URL: {base_url}")
    print(f"  Model:      {model_name or '(auto-discover)'}")
    print(f"  Auto-load:  {auto_load}")

    # ── Test 1: Provider list ──────────────────────────────────────
    banner("1. Provider Discovery")
    providers = list_supported_providers()
    ids = [p["id"] for p in providers]
    ok = report("lmstudio in provider list", "lmstudio" in ids, str(ids))
    passed += ok
    failed += not ok

    # ── Test 2: Factory ────────────────────────────────────────────
    banner("2. Factory / Config")
    cfg = {
        "llm": {
            "active_provider": "lmstudio",
            "providers": {
                "lmstudio": {
                    "base_url": base_url,
                    "model_name": model_name,
                    "auto_load": auto_load,
                }
            }
        }
    }
    try:
        backend = get_backend(cfg)
        ok = report("Factory creates LMStudioBackend", isinstance(backend, LMStudioBackend))
        passed += ok
        failed += not ok

        ok = report("base_url configured", backend.base_url == base_url, f"got {backend.base_url}")
        passed += ok
        failed += not ok

        ok = report("model_name configured", backend.model_name == model_name, f"got {backend.model_name}")
        passed += ok
        failed += not ok

    except Exception as e:
        report("Factory creates LMStudioBackend", False, str(e))
        failed += 1
        traceback.print_exc()
        return passed, failed

    # ── Test 3: Health Check ───────────────────────────────────────
    banner("3. Health Check")
    try:
        h = backend.health_check()
        print(f"  Response: {json.dumps(h, indent=2, default=str)}")

        ok = report("health_check returns dict", isinstance(h, dict))
        passed += ok
        failed += not ok

        ok = report("backend field == lmstudio", h.get("backend") == "lmstudio", f"got {h.get('backend')}")
        passed += ok
        failed += not ok

        if h.get("status") == "ok":
            ok = report("server is up", True, f"model={h.get('model')}")
            passed += ok
        elif h.get("status") == "no_model":
            ok = report("server is up (no model loaded)", True, "model load may be needed")
            passed += ok
        else:
            ok = report("server is up", False, f"status={h.get('status')}, error={h.get('error')}")
            failed += 1

    except Exception as e:
        report("Health check", False, str(e))
        failed += 1
        traceback.print_exc()

    # ── Test 4: Model Discovery ─────────────────────────────────────
    banner("4. Model Discovery")
    try:
        models = backend._discover_models()
        ok = report("discover_models returns list", isinstance(models, list), f"len={len(models)}")
        passed += ok
        failed += not ok

        if models:
            print(f"  Found {len(models)} model(s):")
            for m in models[:5]:
                print(f"    - {m.get('id') or m.get('model_id') or m.get('name', '?')} (state={m.get('state', '?')})")
            if len(models) > 5:
                print(f"    ... and {len(models)-5} more")
        else:
            print("  No models discovered. Is LM Studio server started and a model loaded?")

    except Exception as e:
        report("Model discovery", False, str(e))
        failed += 1
        traceback.print_exc()

    # ── Test 5: Get Loaded Model ────────────────────────────────────
    banner("5. Get Loaded Model")
    try:
        loaded = backend._get_loaded_model()
        if loaded:
            ok = report("Loaded model detected", True, f"id={loaded.get('id') or loaded.get('model_id')}")
            passed += ok
        else:
            ok = report("Loaded model detected", False, "No model is currently loaded")
            failed += 1
    except Exception as e:
        report("Get loaded model", False, str(e))
        failed += 1
        traceback.print_exc()

    # ── Test 6: Native Request (GET /models) ────────────────────────
    banner("6. Native API Request")
    try:
        resp = backend._native_request("/models", method="GET")
        ok = report("GET /api/v1/models works", isinstance(resp, (dict, list)), f"type={type(resp).__name__}")
        passed += ok
        failed += not ok
    except Exception as e:
        report("Native API request", False, str(e))
        failed += 1
        traceback.print_exc()

    # ── Test 7: Load Model (if model_name provided) ───────────────
    if model_name and auto_load:
        banner("7. Model Load / Unload")
        try:
            result = backend.load()
            ok = report("load() returns ok", result == "ok", f"got: {result}")
            passed += ok
            failed += not ok

            # Verify it loaded
            loaded = backend._get_loaded_model()
            ok = report("Model loaded after load()", loaded is not None, str(loaded))
            passed += ok
            failed += not ok

            # Unload
            backend.unload()
            time.sleep(0.5)

            # Verify unloaded
            loaded = backend._get_loaded_model()
            ok = report("Model unloaded after unload()", loaded is None, str(loaded))
            passed += ok
            failed += not ok

        except Exception as e:
            report("Model load/unload", False, str(e))
            failed += 1
            traceback.print_exc()
    else:
        print(f"\n  (Skipping load/unload test — model_name not set or auto_load=False)")

    # ── Test 8: Synchronous Completion (OpenAI-compatible) ────────
    banner("8. Synchronous Completion")
    try:
        # Ensure model is loaded for chat test
        load_result = backend.load()
        if load_result.startswith("[ERROR]"):
            print(f"  ⚠️  Skipping chat test — load failed: {load_result}")
        else:
            messages = [{"role": "user", "content": "Say exactly the word 'PONG' and nothing else."}]
            resp = backend.complete(messages, max_tokens=20)
            ok = report("complete() returns TextResponse", hasattr(resp, "text"), f"type={type(resp).__name__}")
            passed += ok
            failed += not ok

            if hasattr(resp, "text"):
                print(f"  Response text: {repr(resp.text[:200])}")
                ok = report("Response is non-empty", len(resp.text.strip()) > 0, f"len={len(resp.text)}")
                passed += ok
                failed += not ok
    except Exception as e:
        report("Synchronous completion", False, str(e))
        failed += 1
        traceback.print_exc()

    # ── Test 9: Streaming Completion ───────────────────────────────
    banner("9. Streaming Completion")
    try:
        messages = [{"role": "user", "content": "Count from 1 to 3."}]
        tokens = list(backend.stream_text(messages))
        ok = report("stream_text() yields tokens", len(tokens) > 0, f"count={len(tokens)}")
        passed += ok
        failed += not ok

        full_text = "".join(tokens)
        print(f"  Streamed text: {repr(full_text[:200])}")
        ok = report("Streamed text is non-empty", len(full_text.strip()) > 0, f"len={len(full_text)}")
        passed += ok
        failed += not ok

    except Exception as e:
        report("Streaming completion", False, str(e))
        failed += 1
        traceback.print_exc()

    # ── Summary ────────────────────────────────────────────────────
    banner("Summary")
    print(f"  ✅ Passed: {passed}")
    print(f"  ❌ Failed: {failed}")
    print(f"  Total:    {passed + failed}")
    return passed, failed


def main():
    parser = argparse.ArgumentParser(description="Test LM Studio backend integration")
    parser.add_argument("--url", default="http://localhost:1234", help="LM Studio base URL")
    parser.add_argument("--model", default="", help="Model name to load/test")
    parser.add_argument("--auto-load", action="store_true", help="Enable auto-load during test")
    args = parser.parse_args()

    passed, failed = run_all_tests(args.url, args.model, args.auto_load)
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
