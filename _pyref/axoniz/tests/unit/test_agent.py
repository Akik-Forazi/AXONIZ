"""Test Agent core functionality."""
import pytest
from pathlib import Path
from axoniz.core.agent import Agent
from axoniz.core.backend import TextResponse

def test_agent_initialization(temp_workspace, sample_agent_config):
    """Test agent can be created with minimal config."""
    config = sample_agent_config.copy()
    config["workspace"] = str(temp_workspace)
    
    agent = Agent(**config)
    assert Path(agent.workspace).resolve() == temp_workspace.resolve()
    assert agent.config.get("max_steps") == 3

def test_agent_tool_registration(temp_workspace, sample_agent_config):
    """Test that all core tools are registered."""
    config = sample_agent_config.copy()
    config["workspace"] = str(temp_workspace)
    
    agent = Agent(**config)
    
    # Check core tools exist (using actual tool map keys from agent.py)
    assert "file_write" in agent._tool_map
    assert "file_read" in agent._tool_map
    assert "shell_run" in agent._tool_map
    assert "web_search" in agent._tool_map

def test_agent_step_execution(temp_workspace, sample_agent_config, mock_llm_response):
    """Test single tool execution via _exec."""
    config = sample_agent_config.copy()
    config["workspace"] = str(temp_workspace)
    
    agent = Agent(**config)
    
    # Execute a tool directly through the agent's gate
    result = agent._exec("file_write", {"path": "test.txt", "content": "Hello"})
    
    # Check file was created
    test_file = temp_workspace / "test.txt"
    assert test_file.exists()
    assert "Hello" in test_file.read_text()

# Integration tests can be added here once a reliable backend is available for testing.
