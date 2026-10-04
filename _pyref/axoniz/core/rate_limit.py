"""
Local rate limiting using in-memory store.
No Redis or external services required.
"""
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Dict, Optional

class RateLimiter:
    """Token bucket rate limiter (local, in-memory)."""
    
    def __init__(self):
        self.buckets: Dict[str, deque] = defaultdict(deque)
        self.lock = Lock()
    
    def is_allowed(
        self, 
        key: str, 
        max_requests: int = 100, 
        window_seconds: int = 60
    ) -> bool:
        """
        Check if request is allowed under rate limit.
        """
        now = time.time()
        
        with self.lock:
            # Get request history for this key
            requests = self.buckets[key]
            
            # Remove requests outside the time window
            cutoff = now - window_seconds
            while requests and requests[0] < cutoff:
                requests.popleft()
            
            # Check if under limit
            if len(requests) < max_requests:
                requests.append(now)
                return True
            
            return False
    
    def get_remaining(self, key: str, max_requests: int = 100, window_seconds: int = 60) -> int:
        """Get remaining requests for key."""
        now = time.time()
        
        with self.lock:
            requests = self.buckets[key]
            cutoff = now - window_seconds
            
            # Count requests in current window
            current_requests = sum(1 for req_time in requests if req_time > cutoff)
            return max(0, max_requests - current_requests)
    
    def reset(self, key: str):
        """Reset rate limit for key."""
        with self.lock:
            if key in self.buckets:
                del self.buckets[key]

# Global rate limiter instance
_limiter = RateLimiter()

def get_rate_limiter() -> RateLimiter:
    """Get global rate limiter instance."""
    return _limiter
