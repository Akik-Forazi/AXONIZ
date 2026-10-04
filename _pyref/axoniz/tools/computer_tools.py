"""
AXONIZ ComputerTools — GUI awareness and control.
Enables the agent to see the screen, move the mouse, type, and click.
Uses 'pyautogui' for control and 'Pillow' for capture.
"""

import os
import time
import platform
import logging
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger("axoniz.tools.computer")

class ComputerTools:
    def __init__(self, workspace: str = "."):
        self.workspace = os.path.abspath(workspace)
        self._available = None
        self._screen_size = (0, 0)

    def _check_deps(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import pyautogui
            import PIL.Image
            self._available = True
            self._screen_size = pyautogui.size()
            # Safety: move mouse to corner to abort
            pyautogui.FAILSAFE = True
        except ImportError:
            self._available = False
        return self._available

    def mouse_move(self, x: int, y: int) -> str:
        """Move the mouse to absolute coordinates (x, y)."""
        if not self._check_deps():
            return "[ERROR] pyautogui not installed. Run: pip install pyautogui"
        try:
            import pyautogui
            pyautogui.moveTo(x, y, duration=0.2)
            return f"[OK] Mouse moved to ({x}, {y})"
        except Exception as e:
            return f"[ERROR] mouse_move failed: {e}"

    def mouse_click(self, x: Optional[int] = None, y: Optional[int] = None, button: str = 'left') -> str:
        """Click at (x, y) or current position if not provided. button: 'left', 'right', 'middle'."""
        if not self._check_deps():
            return "[ERROR] pyautogui not installed."
        try:
            import pyautogui
            pyautogui.click(x=x, y=y, button=button)
            return f"[OK] {button.capitalize()} click at ({x or 'current'}, {y or 'current'})"
        except Exception as e:
            return f"[ERROR] mouse_click failed: {e}"

    def key_type(self, text: str, interval: float = 0.05) -> str:
        """Type text with an optional interval between keys."""
        if not self._check_deps():
            return "[ERROR] pyautogui not installed."
        try:
            import pyautogui
            pyautogui.write(text, interval=interval)
            return f"[OK] Typed: '{text[:20]}...'"
        except Exception as e:
            return f"[ERROR] key_type failed: {e}"

    def key_press(self, key: str) -> str:
        """Press a special key (e.g., 'enter', 'esc', 'ctrl', 'alt')."""
        if not self._check_deps():
            return "[ERROR] pyautogui not installed."
        try:
            import pyautogui
            pyautogui.press(key)
            return f"[OK] Pressed: {key}"
        except Exception as e:
            return f"[ERROR] key_press failed: {e}"

    def screen_size(self) -> str:
        """Get the primary monitor resolution."""
        if not self._check_deps():
            return "[ERROR] pyautogui not installed."
        return f"Resolution: {self._screen_size[0]}x{self._screen_size[1]}"

    def screen_capture(self, filename: str = "screenshot.png") -> str:
        """Take a screenshot and save it to the workspace."""
        if not self._check_deps():
            return "[ERROR] Pillow/pyautogui not installed."
        path = os.path.join(self.workspace, filename)
        try:
            import pyautogui
            img = pyautogui.screenshot()
            img.save(path)
            return f"[OK] Screenshot saved to {path} ({img.width}x{img.height})"
        except Exception as e:
            return f"[ERROR] screen_capture failed: {e}"

    def screen_find_text(self, text: str) -> str:
        """
        Find coordinates of text on screen using OCR.
        Requires 'pytesseract' and 'Tesseract-OCR' installed on system.
        """
        if not self._check_deps():
            return "[ERROR] Dependencies missing."
        try:
            import pytesseract
            import pyautogui
            import PIL.Image
            img = pyautogui.screenshot()
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            
            # Simple match
            target = text.lower()
            for i, word in enumerate(data['text']):
                if target in word.lower():
                    x = data['left'][i] + data['width'][i] // 2
                    y = data['top'][i] + data['height'][i] // 2
                    return f"[OK] Found '{text}' at ({x}, {y})"
            return f"[NOT FOUND] Text '{text}' not visible on screen."
        except ImportError:
            return "[ERROR] pytesseract not installed. Run: pip install pytesseract"
        except Exception as e:
            return f"[ERROR] screen_find_text failed: {e}"

    def as_tool_map(self) -> Dict[str, Any]:
        return {
            "mouse_move": self.mouse_move,
            "mouse_click": self.mouse_click,
            "key_type": self.key_type,
            "key_press": self.key_press,
            "screen_size": self.screen_size,
            "screen_capture": self.screen_capture,
            "screen_find": self.screen_find_text,
        }
