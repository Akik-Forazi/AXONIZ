#!/usr/bin/env python3
"""PTY wrapper for TUI testing — sends characters slowly for React to process."""
import os, pty, time, select, struct, fcntl, termios, json, argparse, signal

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True)
    parser.add_argument("--entry", default="dist/tui/entry.js")
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--char-delay", type=float, default=0.15, help="Delay between characters in seconds")
    args = parser.parse_args()

    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 100, 0, 0))
    env = os.environ.copy()
    env["FORCE_COLOR"] = "1"; env["TERM"] = "xterm-256color"; env.pop("NO_COLOR", None)
    cmd_args = ["node", args.entry, "--workspace", args.workspace, "--test-mode"]

    pid = os.fork()
    if pid == 0:
        os.close(master); os.setsid()
        os.dup2(slave, 0); os.dup2(slave, 1); os.dup2(slave, 2)
        if slave > 2: os.close(slave)
        os.execvpe("node", cmd_args, env)
    os.close(slave)

    output = b""; start = time.time(); task_sent = False; exit_sent = False; timed_out = False; task_time = 0

    while True:
        if time.time() - start > args.timeout:
            timed_out = True; break
        try:
            wpid, _ = os.waitpid(pid, os.WNOHANG)
            if wpid != 0: break
        except OSError: break

        ready, _, _ = select.select([master], [], [], 0.1)
        if master in ready:
            try: chunk = os.read(master, 4096)
            except OSError: break
            if not chunk: break
            output += chunk

        # Send task once TUI renders (input box border ╭)
        if not task_sent and b"\xe2\x95\xad" in output:
            task_sent = True; task_time = time.time()
            time.sleep(1)  # Wait for TUI to settle
            # Send each character individually with delay for React to process
            for c in args.task:
                os.write(master, c.encode())
                time.sleep(args.char_delay)
            os.write(master, b"\r")  # CR for Enter

        # Send exit 8 seconds after task was sent
        if task_sent and not exit_sent and (time.time() - task_time) > 8:
            exit_sent = True
            for c in "exit":
                os.write(master, c.encode())
                time.sleep(args.char_delay)
            os.write(master, b"\r")

    if timed_out:
        try: os.kill(pid, signal.SIGKILL)
        except: pass
        try: os.waitpid(pid, 0)
        except: pass
    os.close(master)

    exit_code = -1
    try:
        _, status = os.waitpid(pid, 0)
        exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else -1
    except: pass

    print(json.dumps({
        "output": output.decode("utf-8", errors="replace"),
        "exit_code": exit_code, "timed_out": timed_out,
        "task_sent": task_sent, "exit_sent": exit_sent,
    }))

if __name__ == "__main__":
    main()
