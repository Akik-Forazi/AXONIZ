"""
build.py — Build axoniz.exe with PyInstaller
Run: python build.py

Output: dist/axoniz.exe  (single portable executable)
"""

import subprocess
import sys
import os

ROOT   = os.path.dirname(os.path.abspath(__file__))
ENTRY  = os.path.join(ROOT, "axoniz_main.py")
STATIC = os.path.join(ROOT, "axoniz", "web", "static")

# ── Write clean entry-point ────────────────────────────────
with open(ENTRY, "w") as f:
    f.write("from axoniz.core.runner import main\nif __name__ == '__main__':\n    main()\n")

# ── Build command ──────────────────────────────────────────
cmd = [
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--console",
    "--name", "axoniz",
    "--clean",
    "--noconfirm",
    # Web static assets
    "--add-data", f"{STATIC}{os.pathsep}axoniz/web/static",
    # Pull in axoniz modules explicitly
    "--hidden-import", "axoniz.core.agent",
    "--hidden-import", "axoniz.core.runner",
    "--hidden-import", "axoniz.core.backend",
    "--hidden-import", "axoniz.core.cli",
    "--hidden-import", "axoniz.core.config",
    "--hidden-import", "axoniz.core.history",
    "--hidden-import", "axoniz.core.loop",
    "--hidden-import", "axoniz.core.memory",
    "--hidden-import", "axoniz.core.models",
    "--hidden-import", "axoniz.core.first_run",
    "--hidden-import", "axoniz.tools.file_tools",
    "--hidden-import", "axoniz.tools.shell_tools",
    "--hidden-import", "axoniz.tools.web_tools",
    "--hidden-import", "axoniz.tools.code_tools",
    "--hidden-import", "axoniz.agents.specialized",
    "--hidden-import", "axoniz.web.server",
    "--collect-all", "ollama",
    "--collect-all", "llama_cpp",
    # Exclude heavy / conflicting libs
    "--exclude-module", "tkinter",
    "--exclude-module", "matplotlib",
    "--exclude-module", "PIL",
    "--exclude-module", "cv2",
    "--exclude-module", "torch",
    "--exclude-module", "tensorflow",
    "--exclude-module", "numpy",
    "--exclude-module", "PyQt6",
    "--exclude-module", "PySide6",
    "--exclude-module", "PyQt5",
    "--exclude-module", "PySide2",
    ENTRY,
]

print("=" * 60)
print("  Axoniz — Building axoniz.exe")
print("=" * 60)
print()

result = subprocess.run(cmd, cwd=ROOT)

# Cleanup temp entry file (optional, but good for cleanliness)
# try:
#     os.remove(ENTRY)
# except Exception:
#     pass

if result.returncode == 0:
    exe  = os.path.join(ROOT, "dist", "axoniz.exe")
    size = os.path.getsize(exe) // (1024 * 1024)
    print()
    print("=" * 60)
    print(f"  Build successful!")
    print(f"  Executable : dist\\axoniz.exe")
    print(f"  Size       : {size} MB")
    print()
    print("  Run install.bat to add axoniz to your PATH.")
    print("=" * 60)
else:
    print()
    print("=" * 60)
    print("  Build FAILED. See errors above.")
    print("  Make sure PyInstaller is installed: pip install pyinstaller")
    print("=" * 60)
    sys.exit(1)
