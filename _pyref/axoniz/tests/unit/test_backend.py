"""Test universal backend abstraction."""
import json
import unittest.mock as mock
import pytest
from axoniz.core.backend import (
    TextResponse, ToolCallResponse,
    LlamaCppBackend, LlamaCppServerBackend,
    OpenAICompatibleBackend, OllamaBackend,
    LMStudioBackend, get_backend, list_supported_providers,
)

class MockBackend:
    """Test double for backend testing."""
    def __init__(self, responses):
        self.responses = iter(responses)
        self.call_count = 0
    
    def complete(self, messages):
        self.call_count += 1
        return next(self.responses)
    
    def stream_text(self, messages):
        response = next(self.responses)
        for char in response.text:
            yield char
    
    def health_check(self):
        return {"status": "ok", "model": "mock"}

def test_backend_complete():
    """Test synchronous completion."""
    backend = MockBackend([TextResponse("Hello")])
    result = backend.complete([{"role": "user", "content": "Hi"}])
    assert result.text == "Hello"
    assert backend.call_count == 1

def test_backend_streaming():
    """Test token streaming."""
    backend = MockBackend([TextResponse("Test")])
    tokens = list(backend.stream_text([]))
    assert "".join(tokens) == "Test"


# ─── LM Studio Backend Unit Tests ──────────────────────────────────────────

class TestLMStudioBackend:
    """Unit tests for LMStudioBackend (no real LM Studio needed)."""

    def test_init_defaults(self):
        b = LMStudioBackend()
        assert b.base_url == "http://localhost:1234"
        assert b.model_name == ""
        assert b.api_key == "lm-studio"
        assert b.auto_load is True
        assert b.auto_start is False
        assert b.lms_bin == "lms"

    def test_init_custom(self):
        b = LMStudioBackend(
            base_url="http://localhost:1233",
            model_name="qwen2.5-7b",
            api_key="custom-key",
            auto_load=False,
            auto_start=True,
            lms_bin="C:\\Program Files\\LM Studio\\lms.exe"
        )
        assert b.base_url == "http://localhost:1233"
        assert b.model_name == "qwen2.5-7b"
        assert b.api_key == "custom-key"
        assert b.auto_load is False
        assert b.auto_start is True
        assert b.lms_bin == "C:\\Program Files\\LM Studio\\lms.exe"

    def test_headers(self):
        b = LMStudioBackend()
        h = b._headers()
        assert h["Content-Type"] == "application/json"
        assert h["Authorization"] == "Bearer lm-studio"

    def test_resolve_model_explicit(self):
        b = LMStudioBackend(model_name="llama3.1")
        assert b._resolve_model() == "llama3.1"

    def test_resolve_model_loaded(self):
        b = LMStudioBackend()
        b._loaded_model = {"id": "qwen2.5-7b"}
        assert b._resolve_model() == "qwen2.5-7b"

    def test_resolve_model_fallback(self):
        b = LMStudioBackend()
        assert b._resolve_model() == "local"

    def test_is_loaded(self):
        b = LMStudioBackend()
        assert not b.is_loaded()
        b._loaded_model = {"id": "test"}
        assert b.is_loaded()

    @pytest.mark.unit
    def test_health_check_no_server(self):
        """Health check when LM Studio is not running."""
        b = LMStudioBackend(base_url="http://localhost:59999")
        result = b.health_check()
        assert result["status"] == "error"
        assert result["backend"] == "lmstudio"

    @pytest.mark.unit
    def test_load_ok_when_model_loaded(self):
        """load() returns ok if a model is already loaded."""
        b = LMStudioBackend()
        b._loaded_model = {"id": "test-model"}
        assert b.load() == "ok"

    @pytest.mark.unit
    def test_load_with_no_model_and_no_auto_load(self):
        """load() returns ok when auto_load is False and no model is loaded."""
        b = LMStudioBackend(auto_load=False)
        assert b.load() == "ok"

    @pytest.mark.unit
    def test_load_attempts_auto_load(self):
        """load() attempts to POST /models/load when auto_load is True."""
        b = LMStudioBackend(model_name="qwen2.5-7b", auto_load=True)
        with mock.patch.object(b, '_native_request') as m_native:
            # First call: no model loaded, then after load request it appears
            call_count = 0
            def _fake_get_loaded():
                nonlocal call_count
                call_count += 1
                if call_count <= 1:
                    return None
                return {"id": "qwen2.5-7b"}
            with mock.patch.object(b, '_get_loaded_model', side_effect=_fake_get_loaded):
                assert b.load() == "ok"
                m_native.assert_called_once()
                assert m_native.call_args[0][0] == "/models/load"
                assert m_native.call_args[0][1] == {"model": "qwen2.5-7b"}

    @pytest.mark.unit
    def test_load_timeout(self):
        """load() returns error when model load times out."""
        b = LMStudioBackend(model_name="qwen2.5-7b", auto_load=True)
        with mock.patch.object(b, '_native_request') as m_native:
            with mock.patch.object(b, '_get_loaded_model', return_value=None):
                with mock.patch('time.sleep'):  # skip the 15s of real sleep
                    result = b.load()
                assert result.startswith("[ERROR]")
                assert "timed out" in result

    @pytest.mark.unit
    def test_discover_models_native(self):
        """_discover_models hits native endpoint first."""
        b = LMStudioBackend()
        with mock.patch.object(b, '_native_request', return_value={"data": [{"id": "m1"}]}):
            models = b._discover_models()
            assert len(models) == 1
            assert models[0]["id"] == "m1"

    @pytest.mark.unit
    def test_discover_models_openai_fallback(self):
        """_discover_models falls back to OpenAI-compatible endpoint."""
        b = LMStudioBackend()
        with mock.patch.object(b, '_native_request', side_effect=Exception("no native")):
            with mock.patch('axoniz.core.backend.urllib.request.urlopen') as m_urlopen:
                fake_response = mock.Mock()
                fake_response.read.return_value = json.dumps({"data": [{"id": "m2"}]}).encode()
                fake_response.__enter__ = mock.Mock(return_value=fake_response)
                fake_response.__exit__ = mock.Mock(return_value=False)
                m_urlopen.return_value = fake_response
                models = b._discover_models()
                assert len(models) == 1
                assert models[0]["id"] == "m2"

    @pytest.mark.unit
    def test_get_loaded_model(self):
        """_get_loaded_model returns only the model with state == loaded."""
        b = LMStudioBackend()
        with mock.patch.object(b, '_discover_models', return_value=[
            {"id": "a", "state": "loaded"},
            {"id": "b", "state": "not_loaded"},
        ]):
            loaded = b._get_loaded_model()
            assert loaded is not None
            assert loaded["id"] == "a"

    @pytest.mark.unit
    def test_unload_calls_native_endpoint(self):
        """unload() calls native /models/unload."""
        b = LMStudioBackend()
        b._loaded_model = {"id": "x"}
        with mock.patch.object(b, '_native_request') as m_native:
            b.unload()
            m_native.assert_called_once()
            assert m_native.call_args[0][0] == "/models/unload"
            assert b._loaded_model is None

    @pytest.mark.unit
    def test_native_complete(self):
        """_native_complete parses native response."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_native_request', return_value={"content": "Hello from native"}):
            resp = b._native_complete([{"role": "user", "content": "hi"}])
            assert resp.text == "Hello from native"

    @pytest.mark.unit
    def test_native_complete_choices_fallback(self):
        """_native_complete handles OpenAI-style choices response."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_native_request', return_value={
            "choices": [{"message": {"content": "Hello from choices"}}]
        }):
            resp = b._native_complete([{"role": "user", "content": "hi"}])
            assert resp.text == "Hello from choices"

    @pytest.mark.unit
    def test_openai_complete(self):
        """_openai_complete parses OpenAI-compatible response."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_http_post', return_value={
            "choices": [{"message": {"content": "Hello from OAI"}}]
        }):
            resp = b._openai_complete([{"role": "user", "content": "hi"}])
            assert resp.text == "Hello from OAI"

    @pytest.mark.unit
    def test_complete_prefers_native(self):
        """complete() prefers native API, falls back to OpenAI-compatible."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_native_request', return_value={"content": "native"}):
            resp = b.complete([{"role": "user", "content": "hi"}])
            assert resp.text == "native"

    @pytest.mark.unit
    def test_complete_falls_back_on_native_error(self):
        """complete() falls back to OpenAI-compatible when native fails."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_native_request', side_effect=Exception("native down")):
            with mock.patch.object(b, '_openai_complete', return_value=TextResponse("fallback")):
                resp = b.complete([{"role": "user", "content": "hi"}])
                assert resp.text == "fallback"

    @pytest.mark.unit
    def test_complete_returns_error_on_both_fail(self):
        """complete() returns error TextResponse when both native and fallback fail."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_native_request', side_effect=Exception("native down")):
            with mock.patch.object(b, '_openai_complete', side_effect=Exception("fallback down")):
                resp = b.complete([{"role": "user", "content": "hi"}])
                assert isinstance(resp, TextResponse)
                assert "[ERROR] LMStudio" in resp.text

    @pytest.mark.unit
    def test_stream_text_uses_openai_fallback(self):
        """stream_text uses OpenAI-compatible streaming (native streaming not yet supported)."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_openai_stream', return_value=iter(["Hello", " ", "World"])):
            tokens = list(b.stream_text([{"role": "user", "content": "hi"}]))
            assert "".join(tokens) == "Hello World"

    @pytest.mark.unit
    def test_stream_text_error(self):
        """stream_text yields error on exception."""
        b = LMStudioBackend(model_name="test")
        with mock.patch.object(b, '_openai_stream', side_effect=Exception("stream broke")):
            tokens = list(b.stream_text([{"role": "user", "content": "hi"}]))
            assert len(tokens) == 1
            assert "[ERROR] LMStudio stream" in tokens[0]

    @pytest.mark.unit
    def test_openai_stream_parsing(self):
        """_openai_stream correctly parses SSE lines."""
        b = LMStudioBackend(model_name="test")
        fake_lines = [
            b'data: {"choices": [{"delta": {"content": "He"}}]}\n',
            b'data: {"choices": [{"delta": {"content": "llo"}}]}\n',
            b'data: [DONE]\n',
        ]
        with mock.patch.object(b, '_http_stream', return_value=iter(fake_lines)):
            tokens = list(b._openai_stream([{"role": "user", "content": "hi"}]))
            assert "".join(tokens) == "Hello"

    @pytest.mark.unit
    def test_health_check_with_loaded_model(self):
        """health_check returns ok when a model is loaded."""
        b = LMStudioBackend()
        with mock.patch.object(b, '_get_loaded_model', return_value={"id": "qwen2.5-7b"}):
            result = b.health_check()
            assert result["status"] == "ok"
            assert result["backend"] == "lmstudio"
            assert result["model"] == "qwen2.5-7b"

    @pytest.mark.unit
    def test_health_check_no_model(self):
        """health_check returns no_model when server is up but nothing loaded."""
        b = LMStudioBackend()
        with mock.patch.object(b, '_get_loaded_model', return_value=None):
            with mock.patch('urllib.request.urlopen') as m_urlopen:
                m_urlopen.return_value.read.return_value = json.dumps({"data": []}).encode()
                result = b.health_check()
                assert result["status"] == "no_model"

    @pytest.mark.unit
    def test_ensure_server_auto_start(self):
        """_ensure_server starts server via lms CLI if not running."""
        b = LMStudioBackend(auto_start=True)
        with mock.patch.object(b, 'health_check', side_effect=[
            {"status": "error"},  # first call — not running
            {"status": "ok"},    # second call — started
        ]):
            with mock.patch('subprocess.run') as m_run:
                with mock.patch('time.sleep'):  # skip the 30s of real sleep
                    with mock.patch('axoniz.core.backend._which', return_value=True):
                        b._ensure_server()
                m_run.assert_called_once()


# ─── Factory / Config Tests ───────────────────────────────────────────────

class TestFactory:
    """Tests for get_backend() and list_supported_providers()."""

    def test_list_supported_providers_includes_lmstudio(self):
        providers = list_supported_providers()
        ids = [p["id"] for p in providers]
        assert "lmstudio" in ids
        lm = next(p for p in providers if p["id"] == "lmstudio")
        assert lm["name"] == "LM Studio (LMS)"

    def test_factory_lmstudio(self):
        cfg = {
            "llm": {
                "active_provider": "lmstudio",
                "providers": {
                    "lmstudio": {
                        "base_url": "http://localhost:1233",
                        "model_name": "qwen2.5-7b",
                        "auto_load": False,
                    }
                }
            }
        }
        b = get_backend(cfg)
        assert isinstance(b, LMStudioBackend)
        assert b.base_url == "http://localhost:1233"
        assert b.model_name == "qwen2.5-7b"
        assert b.auto_load is False

    def test_factory_lmstudio_flat_config(self):
        """Old-style flat config still routes to lmstudio."""
        cfg = {
            "provider": "lmstudio",
            "base_url": "http://localhost:1233",
        }
        b = get_backend(cfg)
        assert isinstance(b, LMStudioBackend)
        assert b.base_url == "http://localhost:1233"

    def test_factory_lmstudio_defaults(self):
        cfg = {
            "llm": {
                "active_provider": "lmstudio",
                "providers": {"lmstudio": {}}
            }
        }
        b = get_backend(cfg)
        assert isinstance(b, LMStudioBackend)
        assert b.base_url == "http://localhost:1234"
        assert b.model_name == ""
        assert b.api_key == "lm-studio"
        assert b.auto_load is True

    def test_factory_ollama(self):
        cfg = {"llm": {"active_provider": "ollama", "providers": {"ollama": {}}}}
        b = get_backend(cfg)
        assert isinstance(b, OllamaBackend)

    def test_factory_llamacpp(self):
        cfg = {"llm": {"active_provider": "llamacpp", "providers": {"llamacpp": {}}}}
        b = get_backend(cfg)
        assert isinstance(b, LlamaCppBackend)

    def test_factory_openai(self):
        cfg = {"llm": {"active_provider": "openai", "providers": {"openai": {}}}}
        b = get_backend(cfg)
        assert isinstance(b, OpenAICompatibleBackend)

    def test_factory_default(self):
        """Default backend when no provider specified."""
        b = get_backend({})
        assert isinstance(b, LlamaCppBackend)


# ─── Legacy backend tests (keep existing) ─────────────────────────────────

class TestLlamaCppBackend:
    def test_init(self):
        b = LlamaCppBackend(model_path="/tmp/model.gguf")
        assert b.model_path == "/tmp/model.gguf"

    def test_load_missing_file(self):
        b = LlamaCppBackend(model_path="/nonexistent/model.gguf")
        assert b.load().startswith("[ERROR]")

    def test_is_loaded(self):
        b = LlamaCppBackend(model_path="/tmp/model.gguf")
        assert not b.is_loaded()

    def test_health_check(self):
        b = LlamaCppBackend(model_path="/tmp/model.gguf")
        h = b.health_check()
        assert h["status"] == "not_loaded"
        assert h["backend"] == "llamacpp"

    def test_unload(self):
        b = LlamaCppBackend(model_path="/tmp/model.gguf")
        b.unload()  # should not raise

    def test_complete_not_loaded(self):
        b = LlamaCppBackend(model_path="/nonexistent/model.gguf")
        resp = b.complete([{"role": "user", "content": "hi"}])
        assert isinstance(resp, TextResponse)
        assert resp.text.startswith("[ERROR]")

    def test_stream_not_loaded(self):
        b = LlamaCppBackend(model_path="/nonexistent/model.gguf")
        tokens = list(b.stream_text([{"role": "user", "content": "hi"}]))
        assert len(tokens) == 1
        assert tokens[0].startswith("[ERROR]")


class TestLlamaCppServerBackend:
    def test_init(self):
        b = LlamaCppServerBackend(base_url="http://localhost:9000")
        assert b.base_url == "http://localhost:9000"

    def test_auto_start_false(self):
        b = LlamaCppServerBackend(auto_start=False)
        assert b._proc is None

    def test_health_check_no_server(self):
        b = LlamaCppServerBackend(base_url="http://localhost:59999")
        result = b.health_check()
        assert result["status"] == "error"


class TestOpenAICompatibleBackend:
    def test_init(self):
        b = OpenAICompatibleBackend(base_url="https://api.example.com/v1", api_key="sk-test")
        assert b.base_url == "https://api.example.com/v1"
        assert b.api_key == "sk-test"
        assert b.model_name == "local-model"

    def test_headers(self):
        b = OpenAICompatibleBackend(base_url="https://api.example.com", api_key="sk-test")
        h = b._headers()
        assert h["Authorization"] == "Bearer sk-test"
        assert h["Content-Type"] == "application/json"

    def test_complete_no_server(self):
        b = OpenAICompatibleBackend(base_url="http://localhost:59999")
        resp = b.complete([{"role": "user", "content": "hi"}])
        assert isinstance(resp, TextResponse)
        assert resp.text.startswith("[ERROR]")

    def test_stream_no_server(self):
        b = OpenAICompatibleBackend(base_url="http://localhost:59999")
        tokens = list(b.stream_text([{"role": "user", "content": "hi"}]))
        assert len(tokens) == 1
        assert tokens[0].startswith("[ERROR]")

    def test_health_check_no_server(self):
        b = OpenAICompatibleBackend(base_url="http://localhost:59999")
        result = b.health_check()
        assert result["status"] == "error"


class TestOllamaBackend:
    def test_init(self):
        b = OllamaBackend(model_name="llama3")
        assert b.model_name == "llama3"
        assert b.base_url == "http://localhost:11434"

    def test_complete_no_server(self):
        b = OllamaBackend(base_url="http://localhost:59999")
        resp = b.complete([{"role": "user", "content": "hi"}])
        assert isinstance(resp, TextResponse)
        assert resp.text.startswith("[ERROR]")

    def test_stream_no_server(self):
        b = OllamaBackend(base_url="http://localhost:59999")
        tokens = list(b.stream_text([{"role": "user", "content": "hi"}]))
        assert len(tokens) == 1
        assert tokens[0].startswith("[ERROR]")

    def test_health_check_no_server(self):
        b = OllamaBackend(base_url="http://localhost:59999")
        result = b.health_check()
        assert result["status"] == "error"

    def test_stream_parsing(self):
        """Ollama stream parsing handles non-SSE JSON lines."""
        b = OllamaBackend(model_name="test")
        fake_lines = [
            b'{"message": {"content": "Hello"}}\n',
            b'{"message": {"content": " World"}}\n',
        ]
        with mock.patch.object(b, '_http_stream', return_value=iter(fake_lines)):
            tokens = list(b.stream_text([{"role": "user", "content": "hi"}]))
            assert "".join(tokens) == "Hello World"

    def test_stream_parsing_with_done(self):
        """Ollama stream ignores empty lines."""
        b = OllamaBackend(model_name="test")
        fake_lines = [
            b'{"message": {"content": "A"}}\n',
            b'\n',
            b'{"message": {"content": "B"}}\n',
        ]
        with mock.patch.object(b, '_http_stream', return_value=iter(fake_lines)):
            tokens = list(b.stream_text([{"role": "user", "content": "hi"}]))
            assert "".join(tokens) == "AB"
