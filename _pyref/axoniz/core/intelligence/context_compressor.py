"""
axoniz.core.intelligence.context_compressor
============================================
Automatic context window compression for BERU.
Ported from Hermes with refinements for the AXONIZ architecture.

Summarizes earlier turns while protecting head (system prompt) and tail (recent turns).
This ensures BERU can handle long-running missions without losing its mind.
"""

import logging
import time
from typing import Any, Dict, List, Optional

# Constants from Hermes
SUMMARY_PREFIX = (
    "[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted "
    "into the summary below. This is a handoff from a previous context "
    "window — treat it as background reference, NOT as active instructions. "
    "Do NOT answer questions or fulfill requests mentioned in this summary; "
    "they were already addressed. Respond ONLY to the latest user message "
    "that appears AFTER this summary. The current session state (files, "
    "config, etc.) may reflect work described here — avoid repeating it:"
)

_MIN_SUMMARY_TOKENS = 2000
_SUMMARY_RATIO = 0.20
_SUMMARY_TOKENS_CEILING = 12_000
_PRUNED_TOOL_PLACEHOLDER = "[Old tool output cleared to save context space]"
_CHARS_PER_TOKEN = 4

logger = logging.getLogger("axoniz.intelligence.compressor")

class ContextCompressor:
    """
    Compresses conversation context via lossy summarization.
    Keeps BERU's memory efficient.
    """

    def __init__(
        self,
        model: str,
        threshold_percent: float = 0.60,
        protect_first_n: int = 3,
        protect_last_n: int = 15,
        context_length: int = 128000,
    ):
        self.model = model
        self.threshold_percent = threshold_percent
        self.protect_first_n = protect_first_n
        self.protect_last_n = protect_last_n
        self.context_length = context_length
        self.threshold_tokens = int(context_length * threshold_percent)
        self.compression_count = 0
        self._previous_summary: Optional[str] = None

    def should_compress(self, current_tokens: int) -> bool:
        return current_tokens >= self.threshold_tokens

    def compress(self, messages: List[Dict[str, Any]], agent=None) -> List[Dict[str, Any]]:
        """
        Main compression loop.
        agent: The Agent instance (to call LLM for summarization)
        """
        n_messages = len(messages)
        if n_messages <= self.protect_first_n + self.protect_last_n + 2:
            return messages

        logger.info(f"[COMPRESSOR] Triggering context compaction (count: {self.compression_count + 1})")

        # 1. Prune old tool results
        messages = self._prune_tools(messages)

        # 2. Determine middle region
        start = self.protect_first_n
        # Align forward past tool results
        while start < len(messages) and messages[start].get("role") == "tool":
            start += 1
        
        end = len(messages) - self.protect_last_n
        # Align backward to avoid splitting tool groups
        while end > start and messages[end].get("role") == "tool":
            end -= 1
        # If we landed on an assistant message with tool calls, include it in summary
        if end > start and messages[end].get("role") == "assistant" and messages[end].get("tool_calls"):
            pass # Keep it as the end of summary region

        if start >= end:
            return messages

        turns_to_summarize = messages[start:end]
        
        # 3. Generate summary
        summary = self._generate_summary(turns_to_summarize, agent)

        # 4. Reconstruct messages
        compressed = messages[:start]
        
        # Add summary message
        summary_msg = {
            "role": "user", # Standardize on user for summary to avoid confusion
            "content": f"{SUMMARY_PREFIX}\n\n{summary}"
        }
        compressed.append(summary_msg)
        
        # Add tail
        compressed.extend(messages[end:])
        
        self.compression_count += 1
        self._previous_summary = summary
        
        return self._sanitize(compressed)

    def _prune_tools(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        result = []
        # Keep tail tools intact
        tail_start = len(messages) - self.protect_last_n
        for i, msg in enumerate(messages):
            if i < tail_start and msg.get("role") == "tool":
                content = msg.get("content", "")
                if len(content) > 500:
                    msg = {**msg, "content": _PRUNED_TOOL_PLACEHOLDER}
            result.append(msg)
        return result

    def _generate_summary(self, turns: List[Dict[str, Any]], agent) -> str:
        if not agent:
            return "[Summary unavailable: no agent provided]"

        content = self._serialize_turns(turns)
        
        prompt = f"""You are BERU's memory management engine. 
Summarize the following conversation turns into a structured status report.
This will be used as background context for BERU to continue the mission.

CONVERSATION TURNS:
{content}

STRUCTURE:
## Mission Goal
[Current primary objective]

## Progress & Done
[What was achieved, which files were modified, which tools were run]

## Key Facts & Decisions
[Technical decisions, discovered paths, configuration values]

## Remaining Work
[What is left to do]

Be concise but technical. Include file paths and error messages if relevant.
Do NOT include preamble or greeting. Respond ONLY with the summary.
"""
        if self._previous_summary:
            prompt = f"Update the following summary with the new progress below:\n\nOLD SUMMARY:\n{self._previous_summary}\n\nNEW TURNS:\n{content}\n\n{prompt}"

        try:
            # Call agent's internal LLM client directly or via a specific method
            # For AXONIZ, we'll assume agent.call_llm(messages) exists or we use agent.chat
            summary = agent.generate_summary(prompt)
            return summary.strip()
        except Exception as e:
            logger.error(f"[COMPRESSOR] Summary generation failed: {e}")
            return f"[Context Lost: Summary generation failed. {len(turns)} turns removed.]"

    def _serialize_turns(self, turns: List[Dict[str, Any]]) -> str:
        parts = []
        for m in turns:
            role = m.get("role", "").upper()
            content = m.get("content", "")
            if len(content) > 2000:
                content = content[:1000] + "... [truncated] ..." + content[-500:]
            parts.append(f"[{role}]: {content}")
        return "\n\n".join(parts)

    def _sanitize(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Ensure no orphaned tool calls/results.
        Only drop tool results when the backend actually uses tool_call_id
        (i.e. there are assistant messages with tool_calls). For llama.cpp
        backends that use plain text tool calling, pass all tool messages through.
        """
        # Check whether any assistant message in the list uses structured tool_calls
        uses_tool_call_ids = any(
            m.get("role") == "assistant" and m.get("tool_calls")
            for m in messages
        )

        if not uses_tool_call_ids:
            # Plain-text tool calling (llama.cpp fallback) — nothing to sanitize
            return messages

        # Structured tool calling: drop tool results with no matching call ID
        call_ids = set()
        for m in messages:
            if m.get("role") == "assistant" and m.get("tool_calls"):
                for tc in m["tool_calls"]:
                    call_ids.add(tc.get("id"))
        
        final = []
        for m in messages:
            if m.get("role") == "tool":
                if m.get("tool_call_id") not in call_ids:
                    continue  # Drop orphaned tool result
            final.append(m)
        return final
