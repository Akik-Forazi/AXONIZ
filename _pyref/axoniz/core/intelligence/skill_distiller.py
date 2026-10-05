"""
axoniz.core.intelligence.skill_distiller
========================================
The heart of AXONIZ's self-evolution.
Analyzes successful trajectories and distills them into permanent 'Skills'.

A 'Skill' in AXONIZ is a self-contained Python function registered as a tool.
This is more robust than Hermes's skills (which are just prompt injections).
AXONIZ skills are real code, making them faster, more reliable, and zero-context.
"""

import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional
from axoniz.core.config import AXONIZ_HOME

logger = logging.getLogger("axoniz.intelligence.distiller")

SKILLS_DIR = os.path.join(AXONIZ_HOME, "skills")
os.makedirs(SKILLS_DIR, exist_ok=True)

SKILL_TEMPLATE = '''
"""
AXONIZ Skill: {name}
Generated: {date}
Description: {description}
"""

from tools.registry import registry

def {name}({args_call}) -> str:
    """
    {description}
    """
    # Skill logic extracted from trajectory...
    {body}

registry.register(
    name="{name}",
    toolset="user_skills",
    schema={schema},
    handler=lambda args, **kw: {name}(**args),
    emoji="🛡️",
)
'''

class SkillDistiller:
    def __init__(self, agent=None):
        self.agent = agent

    def analyze_session(self, session_id: str) -> Optional[dict]:
        """
        Analyzes a completed trajectory session for 'skill-able' patterns.
        Criteria:
        1. Task was successful.
        2. Involved 5+ steps.
        3. Pattern is repetitive or complex.
        """
        if not self.agent or not hasattr(self.agent, 'trajectory'):
            return None
            
        steps = self.agent.trajectory.get_session_steps(session_id)
        if len(steps) < 5:
            return None
            
        # Logic to extract the 'essence' of the work...
        # We use the LLM to write the Python code for the new skill.
        return self._propose_skill(steps)

    def _propose_skill(self, steps: List[dict]) -> Optional[dict]:
        prompt = f"""You are the AXONIZ Evolution Engine.
Analyze the following tool-calling trajectory and distill it into a reusable Python Skill.
A Skill is a single function that collapses these steps into one call.

TRAJECTORY:
{json.dumps(steps, indent=2)}

OUTPUT:
1. Skill Name (snake_case)
2. Description
3. Parameters (name, type, description)
4. Python Code (using existing axoniz tools or standard libs)

Respond with JSON only.
"""
        try:
            # Call primary LLM to generate the skill code
            proposal_raw = self.agent.generate_summary(prompt)
            match = re.search(r'\{[\s\S]*\}', proposal_raw)
            if not match:
                logger.error("[Distiller] LLM returned no JSON object in proposal")
                return None
            proposal = json.loads(match.group())
            return proposal
        except Exception as e:
            logger.error(f"[Distiller] Failed to propose skill: {e}")
            return None

    def distill(self, proposal: dict):
        """Writes the new skill to the skills directory."""
        name = proposal['name']
        path = os.path.join(SKILLS_DIR, f"{name}.py")
        
        # Format the code...
        code = SKILL_TEMPLATE.format(
            name=name,
            date=time.strftime("%Y-%m-%d"),
            description=proposal['description'],
            args_call=", ".join(proposal['parameters'].keys()),
            body=proposal['code'],
            schema=json.dumps(self._build_schema(proposal))
        )
        
        with open(path, "w", encoding="utf-8") as f:
            f.write(code)
            
        logger.info(f"[Distiller] New skill forged: {name}")
        # Rebuild the LLM so the agent reloads with new tool context on next run
        if self.agent and hasattr(self.agent, "_rebuild_llm"):
            self.agent._rebuild_llm()

    def _build_schema(self, proposal: dict) -> dict:
        # Build OpenAI function schema from proposal
        return {
            "name": proposal['name'],
            "description": proposal['description'],
            "parameters": {
                "type": "object",
                "properties": proposal['parameters'],
                "required": list(proposal['parameters'].keys())
            }
        }
