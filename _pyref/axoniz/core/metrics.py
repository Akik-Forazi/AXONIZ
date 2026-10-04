"""
Prometheus metrics (free, local monitoring).
No cloud costs!
"""
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import time
import psutil

# Metrics
requests_total = Counter(
    'axoniz_requests_total',
    'Total requests processed',
    ['endpoint', 'status']
)

request_duration = Histogram(
    'axoniz_request_duration_seconds',
    'Request processing time',
    ['endpoint']
)

active_agents = Gauge(
    'axoniz_active_agents',
    'Number of active agent instances'
)

tool_executions = Counter(
    'axoniz_tool_executions_total',
    'Total tool executions',
    ['tool_name', 'status']
)

memory_usage_mb = Gauge(
    'axoniz_memory_usage_mb',
    'Current memory usage in MB'
)

def track_request(endpoint: str, status: str, duration: float):
    """Track request metrics."""
    requests_total.labels(endpoint=endpoint, status=status).inc()
    request_duration.labels(endpoint=endpoint).observe(duration)

def track_tool_execution(tool_name: str, success: bool):
    """Track tool execution."""
    status = "success" if success else "error"
    tool_executions.labels(tool_name=tool_name, status=status).inc()

def update_memory_usage():
    """Update memory usage metric."""
    process = psutil.Process()
    memory_usage_mb.set(process.memory_info().rss / 1024 / 1024)

def get_metrics() -> bytes:
    """Get Prometheus metrics in text format."""
    update_memory_usage()
    return generate_latest()

def get_system_telemetry() -> dict:
    """Collect real-time system performance telemetry."""
    try:
        net = psutil.net_io_counters()
        return {
            "cpu": psutil.cpu_percent(interval=None),
            "ram": psutil.virtual_memory().percent,
            "disk": psutil.disk_usage('.').percent,
            "net_mb": round((net.bytes_sent + net.bytes_recv) / (1024 * 1024), 1)
        }
    except Exception:
        return {"cpu": 0, "ram": 0, "disk": 0, "net_mb": 0}
