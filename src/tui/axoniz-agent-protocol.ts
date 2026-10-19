/**
 * AXONIZ AgentProtocol adapter — bridges AXONIZ's Agent class to the
 * AgentProtocol interface that gemini-cli's useAgentStream hook expects.
 *
 * The gemini-cli UI calls:
 *   agent.subscribe(handler)  — register an event handler
 *   agent.send({message})     — submit a user message
 *   agent.abort()             — cancel current operation
 *
 * AXONIZ's Agent provides:
 *   agent.chatStream(message) — AsyncGenerator<string> (token stream)
 *   agent.run(task)           — full agent loop with tools
 *   agent.onToken callback    — streaming hook
 *   agent.onToolCall callback — tool call notification
 *   agent.onToolResult callback — tool result notification
 *
 * This adapter translates between the two:
 *   - send({message}) → starts agent.chatStream() in background,
 *     translates each token into a Content event, calls handler
 *   - subscribe(handler) → stores the handler, wires it to agent callbacks
 *   - abort() → calls agent.reset() / sets abort flag
 */
import { EventEmitter } from "node:events";

export interface AgentEvent {
  type: string;
  data?: any;
}

export interface AgentProtocol {
  subscribe(handler: (event: AgentEvent) => void): () => void;
  send(request: { message: { content: any } }): Promise<void>;
  abort(): void;
}

/**
 * Adapter that wraps an AXONIZ Agent instance into the AgentProtocol shape.
 *
 * useAgentStream.ts calls:
 *   const unsubscribe = agent.subscribe(handleEvent);
 *   await agent.send({ message: { content: parts } });
 *   agent.abort();
 *
 * We translate:
 *   - send() → starts agent.chatStream(messageText), streams tokens
 *     into 'Content' events, emits 'Finished' when done
 *   - subscribe() → returns an unsubscribe function
 *   - abort() → cancels the in-flight chatStream
 */
export class AxonizAgentProtocol implements AgentProtocol {
  private handler: ((event: AgentEvent) => void) | null = null;
  private abortController: AbortController | null = null;
  private isRunning = false;

  constructor(private agent: any) {
    // Wire AXONIZ agent callbacks to our event system
    this.agent.onToken = (token: string) => {
      this.emit({ type: "Content", data: { text: token } });
    };
    this.agent.onToolCall = (name: string, args: Record<string, unknown>) => {
      this.emit({ type: "ToolCallRequest", data: { name, args } });
    };
    this.agent.onToolResult = (name: string, result: string) => {
      this.emit({ type: "ToolCallResponse", data: { name, result } });
    };
    this.agent.onThought = (content: string) => {
      this.emit({ type: "Thought", data: { text: content } });
    };
    this.agent.onStep = (step: number, total: number) => {
      this.emit({ type: "Step", data: { step, total } });
    };
    this.agent.onDone = () => {
      this.emit({ type: "Finished" });
      this.isRunning = false;
    };
  }

  subscribe(handler: (event: AgentEvent) => void): () => void {
    this.handler = handler;
    return () => { this.handler = null; };
  }

  async send(request: { message: { content: any } }): Promise<void> {
    // Extract the plain text from the message content
    // The gemini-cli UI sends content as a complex object with parts;
    // we extract the text from it
    const content = request.message?.content;
    let messageText = "";
    if (typeof content === "string") {
      messageText = content;
    } else if (Array.isArray(content)) {
      // Gemini-style parts array — extract text parts
      messageText = content
        .filter((p: any) => p?.text)
        .map((p: any) => p.text)
        .join("");
    } else if (content?.text) {
      messageText = content.text;
    }

    if (!messageText.trim()) return;

    this.isRunning = true;
    this.abortController = new AbortController();

    this.emit({ type: "Start" });

    try {
      // Call AXONIZ's chatStream — yields tokens one at a time
      for await (const token of this.agent.chatStream(messageText)) {
        if (this.abortController?.signal.aborted) break;
        this.emit({ type: "Content", data: { text: token } });
      }
    } catch (e) {
      this.emit({
        type: "Error",
        data: { message: e instanceof Error ? e.message : String(e) },
      });
    } finally {
      this.emit({ type: "Finished" });
      this.isRunning = false;
    }
  }

  abort(): void {
    this.abortController?.abort();
    try {
      this.agent.reset();
    } catch {}
    this.emit({ type: "Aborted" });
    this.isRunning = false;
  }

  private emit(event: AgentEvent): void {
    if (this.handler) {
      try {
        this.handler(event);
      } catch {}
    }
  }
}
