from enum import Enum

class GoalStatus(str, Enum):
    ACTIVE    = "active"
    PAUSED    = "paused"
    DONE      = "done"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class GoalPriority(str, Enum):
    CRITICAL = "critical"
    HIGH     = "high"
    MEDIUM   = "medium"
    LOW      = "low"
