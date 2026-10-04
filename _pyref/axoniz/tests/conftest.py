"""Shared test fixtures and configuration."""
import pytest
import tempfile
import shutil
from pathlib import Path

@pytest.fixture
def temp_workspace():
    """Temporary workspace for test isolation."""
    tmpdir = tempfile.mkdtemp()
    yield Path(tmpdir)
    shutil.rmtree(tmpdir, ignore_errors=True)

@pytest.fixture
def mock_llm_response():
    """Mock LLM responses for deterministic testing."""
    return {
        "text": "<think>Testing code</think>\n<act>write('test.py', 'print(1+1)')</act>",
        "model": "test-model",
        "tokens": 100
    }

@pytest.fixture
def sample_agent_config():
    """Minimal agent configuration for testing."""
    return {
        "backend": "openai",
        "model": "test-model",
        "max_steps": 3,
        "workspace": None  # Will be set per-test
    }
