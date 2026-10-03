/**
 * Cross-platform "open this URL in the default browser" helper.
 * Uses the `open` package when available, falling back to platform commands.
 *
 * On Windows the empty `""` argument after `start` is required, otherwise the
 * URL is interpreted as the console window title.
 */
import { spawn } from "node:child_process";

export async function openInBrowser(url: string): Promise<void> {
  try {
    const mod = (await import("open")) as { default: (u: string, o?: unknown) => Promise<unknown> };
    await mod.default(url);
    return;
  } catch {
    /* fall through to the platform command */
  }

  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else if (platform === "darwin") {
    cmd = "open";
    args = [url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
