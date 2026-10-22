#!/usr/bin/env python3
"""
Screenshot the HTML captures to PNG using Playwright + Chromium.

Renders each HTML file at 1100x800 viewport with dark background,
saves a PNG to /home/z/my-project/download/.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

DOWNLOAD = Path("/home/z/my-project/download")

SCENARIOS = [
    ("01-cli-banner.html", "01-cli-banner.png", 1100, 700),
    ("02-cli-help.html", "02-cli-help.png", 1100, 800),
    ("03-cli-providers.html", "03-cli-providers.png", 1100, 800),
    ("04-cli-tools.html", "04-cli-tools.png", 1100, 1100),
    ("05-cli-models.html", "05-cli-models.png", 1100, 700),
    ("06-cli-switch.html", "06-cli-switch.png", 1100, 700),
    ("07-cli-chat.html", "07-cli-chat.png", 1100, 1400),
]

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for html_name, png_name, w, h in SCENARIOS:
            html_path = DOWNLOAD / html_name
            png_path = DOWNLOAD / png_name
            if not html_path.exists():
                print(f"  ⚠ {html_name} not found, skipping")
                continue
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
            page.goto(f"file://{html_path.absolute()}")
            page.wait_for_load_state("networkidle")
            # Auto-size to content
            actual = page.evaluate("""
                () => {
                    const pre = document.querySelector('pre');
                    if (pre) {
                        const rect = pre.getBoundingClientRect();
                        return { w: Math.ceil(rect.right + 24), h: Math.ceil(rect.bottom + 80) };
                    }
                    return { w: 1100, h: 700 };
                }
            """)
            page.set_viewport_size({"width": min(actual["w"], 1600), "height": min(actual["h"], 2000)})
            page.screenshot(path=str(png_path), full_page=True)
            print(f"  → {png_name} ({actual['w']}x{actual['h']})")
            page.close()
        browser.close()
    print("Done.")

if __name__ == "__main__":
    main()
