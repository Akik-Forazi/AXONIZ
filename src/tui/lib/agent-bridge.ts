/**
 * Agent bridge — connects the AXONIZ agent's streaming callbacks to
 * the React state in the TUI.
 *
 * For testing without an actual agent, use the MockBridge below — it
 * streams tokens one-by-one with a delay, simulating a real LLM.
 */

export interface AgentBridge {
  exec(
    input: string,
    onToken: (token: string) => void,
    onDone: () => void,
  ): Promise<void>;
}

/** Mock bridge — streams a fake response token by token. For testing the TUI. */
export class MockBridge implements AgentBridge {
  async exec(input: string, onToken: (t: string) => void, onDone: () => void): Promise<void> {
    const response = `You said: "${input}". This is a mock response from the AXONIZ TUI.
The real agent will be wired in next. Here's some sample markdown:

\`\`\`typescript
function hello(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

- Bullet one
- Bullet two
- Bullet three

That's it. Pretty cool, right?`;
    // Stream tokens with small delays
    const tokens = response.match(/\S+\s*/g) ?? [response];
    for (const tok of tokens) {
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      onToken(tok);
    }
    onDone();
  }
}
