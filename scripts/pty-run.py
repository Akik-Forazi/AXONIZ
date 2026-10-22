#!/usr/bin/env python3
"""
PTY runner — runs a command in a pseudo-terminal so the CLI thinks
it's connected to a real TTY (isTTY=true). This enables:
  - ANSI colors
  - Spinner animation (braille dots)
  - Inline token streaming
  - readline prompt rendering

Captures all bytes (including ANSI escape codes) to an output file.
"""
import os
import pty
import sys
import time
import select
from pathlib import Path

def run(cmd: list[str], inputs: list[str], output_path: str, idle_timeout: float = 3.0):
    """Run cmd in a PTY, send each input string (with \n), capture all output."""
    master, slave = pty.openpty()
    # Set window size — 100 cols x 40 rows
    import struct
    import fcntl
    import termios
    winsize = struct.pack("HHHH", 40, 100, 0, 0)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, winsize)

    env = os.environ.copy()
    env["FORCE_COLOR"] = "1"
    env["TERM"] = "xterm-256color"
    env["NO_COLOR"] = ""  # unset
    env.pop("NO_COLOR", None)

    pid = os.fork()
    if pid == 0:
        # Child
        os.close(master)
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)
        os.execvpe(cmd[0], cmd, env)
        os._exit(1)

    # Parent
    os.close(slave)

    output = b""
    input_queue = list(inputs)
    last_byte_time = time.time()
    sent_all_inputs = False

    while True:
        try:
            ready, _, _ = select.select([master], [], [], 0.2)
        except (OSError, select.error):
            break

        if master in ready:
            try:
                chunk = os.read(master, 4096)
            except OSError:
                break
            if not chunk:
                break
            output += chunk
            last_byte_time = time.time()
        else:
            # Idle — send next input if available
            if input_queue and (time.time() - last_byte_time) > idle_timeout:
                next_input = input_queue.pop(0)
                try:
                    os.write(master, next_input.encode("utf-8"))
                    last_byte_time = time.time()
                except OSError:
                    break
            elif not input_queue and (time.time() - last_byte_time) > 2.0:
                # No more inputs + idle for 2s — done
                break

    # Try to clean up the child
    try:
        os.kill(pid, 9)
    except OSError:
        pass
    try:
        os.waitpid(pid, 0)
    except OSError:
        pass
    os.close(master)

    Path(output_path).write_bytes(output)
    return output.decode("utf-8", errors="replace")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: pty-run.py <output_file> <command...> -- <inputs...>")
        sys.exit(1)
    output_path = sys.argv[1]
    args = sys.argv[2:]
    if "--" in args:
        sep = args.index("--")
        cmd = args[:sep]
        inputs = args[sep + 1:]
    else:
        cmd = [args[0]]
        inputs = args[1:]

    # Parse inputs — split by literal "ENTER"/"EXIT" markers
    parsed_inputs = []
    for i in inputs:
        if i == "ENTER":
            parsed_inputs.append("\n")
        elif i == "CTRL_C":
            parsed_inputs.append("\x03")
        elif i == "EXIT":
            parsed_inputs.append("exit\n")
        else:
            parsed_inputs.append(i + "\n")

    output = run(cmd, parsed_inputs, output_path)
    sys.stdout.write(f"Saved PTY capture to {output_path}\n")
    sys.stdout.write(f"Bytes captured: {len(output)}\n")
