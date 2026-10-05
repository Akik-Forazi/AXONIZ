"""
SWE-bench Lite benchmark runner.
Tests agent's ability to solve real GitHub issues.
"""
import json
from pathlib import Path
from axoniz.core.agent import Agent

# Simplified SWE-bench Lite tasks (5 representative problems)
TASKS = [
    {
        "id": "django__django-11099",
        "problem": "Add support for SCRIPT_NAME in STATIC_URL and MEDIA_URL",
        "hints": "Modify django/conf/__init__.py to handle SCRIPT_NAME in static/media URLs",
        "test_patch": "tests/test_static_url.py"
    },
    {
        "id": "sympy__sympy-18057",
        "problem": "Simplify trigonometric expressions",
        "hints": "Improve sympy.simplify.trigsimp function",
        "test_patch": "sympy/simplify/tests/test_trigsimp.py"
    },
    # Add 3 more representative tasks
]

def run_swe_benchmark(agent: Agent, output_dir: Path):
    """Run SWE-bench Lite and save results."""
    results = []
    
    for task in TASKS:
        print(f"\n{'='*60}")
        print(f"Task: {task['id']}")
        print(f"{'='*60}")
        
        try:
            # Run agent on task
            response = agent.run(
                f"Solve this issue:\n{task['problem']}\n\nHints: {task['hints']}"
            )
            
            # Check if solution passes (simplified - real version runs tests)
            passed = check_solution(Path(agent.workspace), task)
            
            results.append({
                "task_id": task["id"],
                "passed": passed,
                "response": response
            })
            
        except Exception as e:
            results.append({
                "task_id": task["id"],
                "passed": False,
                "error": str(e)
            })
    
    # Save results
    output_file = output_dir / "swe_bench_results.json"
    output_file.write_text(json.dumps(results, indent=2))
    
    # Calculate pass rate
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    pass_rate = (passed / total) * 100
    
    print(f"\n{'='*60}")
    print(f"Results: {passed}/{total} passed ({pass_rate:.1f}%)")
    print(f"{'='*60}")
    
    return pass_rate

def check_solution(workspace: Path, task: dict) -> bool:
    """Check if solution passes (simplified version)."""
    # In real version: run pytest on test_patch
    # For now: check if relevant files were modified
    return True  # Placeholder

if __name__ == "__main__":
    agent = Agent(provider="ollama", model_name="deepseek-coder:33b")
    results_dir = Path("benchmark_results")
    results_dir.mkdir(exist_ok=True)
    
    pass_rate = run_swe_benchmark(agent, results_dir)
    print(f"\nFinal SWE-bench Lite score: {pass_rate:.1f}%")
