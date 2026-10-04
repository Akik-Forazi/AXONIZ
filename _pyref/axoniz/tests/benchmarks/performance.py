"""Performance benchmarking suite."""
import time
import psutil
import json
from pathlib import Path
from axoniz.core.agent import Agent

def measure_latency(agent: Agent, prompts: list) -> dict:
    """Measure time-to-first-token and total completion time."""
    results = []
    
    for prompt in prompts:
        start = time.time()
        
        # Measure TTFT (time to first token)
        first_token_time = None
        for i, chunk in enumerate(agent.chat_stream(prompt)):
            if i == 0:
                first_token_time = time.time() - start
        
        total_time = time.time() - start
        
        results.append({
            "prompt_len": len(prompt),
            "ttft_ms": (first_token_time * 1000) if first_token_time else 0,
            "total_time_s": total_time
        })
    
    return {
        "avg_ttft_ms": sum(r["ttft_ms"] for r in results) / len(results),
        "avg_total_s": sum(r["total_time_s"] for r in results) / len(results),
        "results": results
    }

def measure_memory(agent: Agent, task: str) -> dict:
    """Measure memory usage during execution."""
    process = psutil.Process()
    
    mem_before = process.memory_info().rss / 1024 / 1024  # MB
    agent.run(task)
    mem_after = process.memory_info().rss / 1024 / 1024   # MB
    
    return {
        "memory_before_mb": mem_before,
        "memory_after_mb": mem_after,
        "memory_delta_mb": mem_after - mem_before
    }

def measure_throughput(agent: Agent, num_tasks: int = 10) -> dict:
    """Measure tasks completed per minute."""
    tasks = [f"Create file_{i}.txt with content 'test'" for i in range(num_tasks)]
    
    start = time.time()
    for task in tasks:
        agent.run(task)
    total_time = time.time() - start
    
    return {
        "tasks_completed": num_tasks,
        "total_time_s": total_time,
        "throughput_tasks_per_min": (num_tasks / total_time) * 60
    }

if __name__ == "__main__":
    agent = Agent(provider="ollama", model_name="llama2")
    
    # Run benchmarks
    print("Running latency benchmark...")
    latency = measure_latency(agent, [
        "Write a hello world script",
        "List all Python files",
        "Search for 'function' in code"
    ])
    
    print("Running memory benchmark...")
    memory = measure_memory(agent, "Create a complex Python module")
    
    print("Running throughput benchmark...")
    throughput = measure_throughput(agent, num_tasks=10)
    
    # Save results
    results = {
        "latency": latency,
        "memory": memory,
        "throughput": throughput,
        "timestamp": time.time()
    }
    
    Path("benchmark_results").mkdir(exist_ok=True)
    Path("benchmark_results/performance.json").write_text(
        json.dumps(results, indent=2)
    )
    
    print("\n" + "="*60)
    print("Performance Results:")
    print(f"  Avg TTFT: {latency['avg_ttft_ms']:.0f}ms")
    print(f"  Avg Total Time: {latency['avg_total_s']:.1f}s")
    print(f"  Memory Delta: {memory['memory_delta_mb']:.1f}MB")
    print(f"  Throughput: {throughput['throughput_tasks_per_min']:.1f} tasks/min")
    print("="*60)
