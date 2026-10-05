/**
 * Stream tag-watcher. Reads the model's output character by character and
 * detects structured blocks: <thought>, <action>, <ENDOFOP>.
 * Port of axoniz/core/stream_parser.py.
 */
import { debug } from "./debug.js";

export type State = "text" | "thought" | "action" | "endofop";

export type TextHandler = (text: string) => void;
export type ThoughtHandler = (content: string) => void;
export type ActionHandler = (tool: string, args: Record<string, unknown>) => void;
export type EndOfOpHandler = (summary: string) => void;
export type ErrorHandler = (message: string) => void;

interface TagSpec {
  open: string;
  close: string;
  state: State;
}

const TAGS: TagSpec[] = [
  { open: "<thought>", close: "</thought>", state: "thought" },
  { open: "<action>", close: "</action>", state: "action" },
  { open: "<ENDOFOP>", close: "</ENDOFOP>", state: "endofop" },
];

const MAX_TAG_LEN = Math.max(...TAGS.map((t) => t.open.length));

export interface StreamParserHandlers {
  onText?: TextHandler;
  onThought?: ThoughtHandler;
  onAction?: ActionHandler;
  onEndOfOp?: EndOfOpHandler;
  onError?: ErrorHandler;
}

export class StreamParser {
  static readonly STATE_TEXT: State = "text";
  static readonly STATE_THOUGHT: State = "thought";
  static readonly STATE_ACTION: State = "action";
  static readonly STATE_ENDOFOP: State = "endofop";

  private readonly onText: TextHandler;
  private readonly onThought: ThoughtHandler;
  private readonly onAction: ActionHandler;
  private readonly onEndOfOp: EndOfOpHandler;
  private readonly onError: ErrorHandler;

  private state: State = "text";
  private rawBuffer = "";
  private tagBuffer = "";
  private content = "";

  constructor(handlers: StreamParserHandlers = {}) {
    this.onText = handlers.onText ?? (() => undefined);
    this.onThought = handlers.onThought ?? (() => undefined);
    this.onAction = handlers.onAction ?? (() => undefined);
    this.onEndOfOp = handlers.onEndOfOp ?? (() => undefined);
    this.onError = handlers.onError ?? (() => undefined);
  }

  /** Feed a chunk of text into the watcher. */
  feed(token: string): void {
    for (const ch of token) this.processChar(ch);
  }

  private processChar(ch: string): void {
    this.rawBuffer += ch;

    if (this.state === "text") {
      this.tagBuffer += ch;

      for (const tag of TAGS) {
        if (this.tagBuffer.endsWith(tag.open)) {
          const preText = this.tagBuffer.slice(0, this.tagBuffer.length - tag.open.length);
          if (preText) this.onText(preText);
          this.tagBuffer = "";
          this.content = "";
          this.state = tag.state;
          debug(`Parser: Spotted an opening tag for '${tag.state}'.`);
          return;
        }
      }

      // Bound the tag buffer so it never retains too much pending text.
      if (this.tagBuffer.length > MAX_TAG_LEN + 2) {
        const flush = this.tagBuffer[0];
        this.tagBuffer = this.tagBuffer.slice(1);
        this.onText(flush);
      }
      return;
    }

    // Inside a tag: accumulate until the close tag arrives.
    this.content += ch;
    for (const tag of TAGS) {
      if (tag.state === this.state && this.content.endsWith(tag.close)) {
        const inner = this.content.slice(0, this.content.length - tag.close.length);
        debug(`Parser: Found the end of the '${this.state}' block.`);
        this.dispatch(this.state, inner.trim());
        this.state = "text";
        this.content = "";
        this.tagBuffer = "";
        return;
      }
    }
  }

  private dispatch(state: State, content: string): void {
    if (state === "thought") {
      this.onThought(content);
    } else if (state === "action") {
      const { tool, args } = parseAction(content);
      if (tool) this.onAction(tool, args);
      else this.onError(`I couldn't quite figure out this action: ${content.slice(0, 100)}`);
    } else if (state === "endofop") {
      this.onEndOfOp(content);
    }
  }

  /** Emit any buffered text when the stream ends. */
  flush(): void {
    if (this.tagBuffer && this.state === "text") {
      this.onText(this.tagBuffer);
      this.tagBuffer = "";
    }
  }

  /** Reset for a fresh stream. */
  reset(): void {
    this.state = "text";
    this.rawBuffer = "";
    this.tagBuffer = "";
    this.content = "";
  }
}

/** Best-effort parse of an <action> body into a tool name plus arguments. */
export function parseAction(content: string): { tool: string | null; args: Record<string, unknown> } {
  let text = content.trim();
  // Strip markdown code fences the model may have added.
  text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
  // Repair trailing commas before a closing brace/bracket.
  text = text.replace(/,(\s*[}\]])/g, "$1");

  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    const tool = (obj.tool ?? obj.name ?? obj.function) as string | undefined;
    let args = (obj.args ?? obj.arguments ?? obj.parameters ?? {}) as unknown;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    if (tool) {
      return {
        tool: String(tool),
        args: (args && typeof args === "object" ? args : {}) as Record<string, unknown>,
      };
    }
  } catch {
    const m = text.match(/"(?:tool|name|function)"\s*:\s*"([^"]+)"/);
    if (m) return { tool: m[1], args: {} };
  }

  return { tool: null, args: {} };
}
