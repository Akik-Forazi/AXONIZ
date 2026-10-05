"""Test tool implementations."""
import pytest
from pathlib import Path
from axoniz.tools.file_tools import FileTools
from axoniz.tools.shell_tools import ShellTools
from axoniz.tools.web_tools import WebTools

def test_file_tools_write_read(temp_workspace):
    """Test file write and read operations."""
    tools = FileTools(workspace=str(temp_workspace))
    
    # Write file
    result = tools.write("test.txt", "Hello World")
    assert "[OK] Wrote" in result
    
    # Read file
    content = tools.read("test.txt")
    assert "Hello World" in content

def test_file_tools_list(temp_workspace):
    """Test directory listing."""
    tools = FileTools(workspace=str(temp_workspace))
    
    # Create test files
    (temp_workspace / "file1.txt").write_text("a")
    (temp_workspace / "file2.py").write_text("b")
    
    # List directory
    result = tools.list_dir(".")
    assert "file1.txt" in result
    assert "file2.py" in result

def test_shell_tools_run(temp_workspace):
    """Test shell command execution."""
    tools = ShellTools(workspace=str(temp_workspace))
    
    # Test simple command
    result = tools.run("echo test")
    assert "test" in result.lower()

def test_shell_tools_python(temp_workspace):
    """Test Python code execution."""
    tools = ShellTools(workspace=str(temp_workspace))
    
    code = "print(1 + 1)"
    result = tools.run_python(code)
    assert "2" in result

@pytest.mark.integration
def test_web_tools_search():
    """Test web search (requires internet)."""
    tools = WebTools()
    
    result = tools.search("Python programming", max_results=3)
    assert len(result) > 0
    assert "python" in result.lower()
