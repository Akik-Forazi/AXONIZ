#!/usr/bin/env python3
"""
Convert all /tmp/cap-*.txt PTY captures to HTML files in
/home/z/my-project/download/ with consistent styling.

Wraps ansi2html output in a full HTML document with:
- Dark background (matches AXONIZ theme)
- JetBrains Mono / system mono fallback
- Padding + max-width for readability
- Pre-wrap to preserve terminal formatting
"""
import subprocess
import sys
from pathlib import Path
import re

DOWNLOAD = Path("/home/z/my-project/download")
DOWNLOAD.mkdir(parents=True, exist_ok=True)

def to_html(input_path: Path, output_path: Path, title: str):
    """Convert a raw ANSI capture to a styled HTML page."""
    raw = input_path.read_bytes()
    # Run ansi2html to get the styled pre block
    result = subprocess.run(
        ["/home/z/.local/bin/ansi2html", "-i", "--no-line-wrap"],
        input=raw,
        capture_output=True,
    )
    inner = result.stdout.decode("utf-8", errors="replace")
    # Build a full HTML doc around the inline-styled output
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <style>
    body {{
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.4;
      padding: 24px;
      margin: 0;
      max-width: 1100px;
      margin: 0 auto;
    }}
    pre {{
      white-space: pre-wrap;
      word-wrap: break-word;
      background: #0a0a0a;
      padding: 0;
      margin: 0;
    }}
    h1 {{
      color: #c084fc;
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 16px 0;
      border-bottom: 1px solid #333;
      padding-bottom: 8px;
    }}
    .meta {{
      color: #666;
      font-size: 11px;
      margin-bottom: 16px;
    }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <div class="meta">Captured: {input_path.name} · {len(raw)} bytes · ANSI preserved</div>
  <pre>{inner}</pre>
</body>
</html>
"""
    output_path.write_text(html, encoding="utf-8")
    print(f"  → {output_path.name} ({len(html)} bytes)")

if __name__ == "__main__":
    scenarios = [
        ("cap-banner.txt", "01-cli-banner.html", "AXONIZ CLI — banner + startup (--provider orca)"),
        ("cap-help.txt", "02-cli-help.html", "AXONIZ CLI — /help command (two-column layout)"),
        ("cap-providers.txt", "03-cli-providers.html", "AXONIZ CLI — /providers list"),
        ("cap-tools.txt", "04-cli-tools.html", "AXONIZ CLI — /tools list (72 tools)"),
        ("cap-models.txt", "05-cli-models.html", "AXONIZ CLI — /models picker"),
        ("cap-switch.txt", "06-cli-switch.html", "AXONIZ CLI — /switch validation"),
        ("cap-chat.txt", "07-cli-chat.html", "AXONIZ CLI — chat with orca (no API key, graceful error)"),
    ]
    for raw_name, out_name, title in scenarios:
        raw_path = Path(f"/tmp/{raw_name}")
        if raw_path.exists():
            to_html(raw_path, DOWNLOAD / out_name, title)
        else:
            print(f"  ⚠ {raw_name} not found, skipping")
    print("Done.")
