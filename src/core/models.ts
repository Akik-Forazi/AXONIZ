/**
 * AXONIZ-ZERO Model Registry.
 * Central registry of AI models with hardware requirements and guidance.
 * Port of axoniz/core/models.py.
 */

export interface ModelVariant {
  /** A short, memorable identifier (e.g. "qwen-coder"). */
  name: string;
  /** The technical filename used for local execution. */
  gguf_name: string;
  /** The source repository on HuggingFace. */
  repo: string;
  /** Disk space footprint in GB. */
  size_gb: number;
  /** Minimum system memory required for stable operation, in GB. */
  ram_gb: number;
  /** Maximum context window (token limit). */
  ctx: number;
  /** Optimized creativity setting for this model. */
  temperature: number;
  /** Safe upper limit for generated responses. */
  max_tokens: number;
  /** Functional categories (e.g. ["coding", "reasoning"]). */
  tags: string[];
  /** A concise summary of the model's architecture. */
  description: string;
  /** Practical advice on when to use this model. */
  best_for: string;
  /** Expected performance on standard hardware. */
  speed_toks: string;
  /** Whether this is the primary choice for most users. */
  recommended: boolean;
}

export function hfUrl(m: ModelVariant): string {
  return `https://huggingface.co/${m.repo}`;
}

/** Determines if the system has enough memory to run this model. */
export function fits(m: ModelVariant, availableRamGb = 14.0): boolean {
  return m.ram_gb <= availableRamGb;
}

/** The global model registry, vetted for typical mobile/desktop CPUs. */
export const REGISTRY: Record<string, ModelVariant> = {
  "gemma3-4b": {
    name: "gemma3-4b",
    gguf_name: "Gemma-3-4B-VL-it-Gemini-Pro-Heretic-Uncensored-Thinking_Q8_0.gguf",
    repo: "local",
    size_gb: 4.5,
    ram_gb: 6.0,
    ctx: 8192,
    temperature: 0.7,
    max_tokens: 4096,
    tags: ["local", "general", "multimodal", "vision", "reasoning"],
    description: "Gemma 3 4B VL — A versatile multimodal model combining vision and language.",
    best_for: "General assistance, visual analysis, and logical reasoning.",
    speed_toks: "5–9 tok/s",
    recommended: true,
  },

  "qwen-coder": {
    name: "qwen-coder",
    gguf_name: "qwen2.5-coder-7b-instruct-q6_k.gguf",
    repo: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    size_gb: 5.9,
    ram_gb: 8.5,
    ctx: 8192,
    temperature: 0.2,
    max_tokens: 4096,
    tags: ["coding", "professional", "agentic"],
    description: "Qwen2.5-Coder 7B — A state-of-the-art model for software development.",
    best_for: "Python, JavaScript, SQL, and complex architectural tasks.",
    speed_toks: "3–5 tok/s",
    recommended: false,
  },

  "phi35-mini": {
    name: "phi35-mini",
    gguf_name: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    repo: "bartowski/Phi-3.5-mini-instruct-GGUF",
    size_gb: 2.4,
    ram_gb: 3.5,
    ctx: 8192,
    temperature: 0.3,
    max_tokens: 2048,
    tags: ["fast", "lightweight", "efficient"],
    description: "Phi-3.5 Mini — A compact yet surprisingly powerful model from Microsoft.",
    best_for: "Low-latency tasks and lightweight coding automation.",
    speed_toks: "10–14 tok/s",
    recommended: false,
  },

  "llama32-3b": {
    name: "llama32-3b",
    gguf_name: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    size_gb: 2.0,
    ram_gb: 3.0,
    ctx: 4096,
    temperature: 0.6,
    max_tokens: 2048,
    tags: ["fast", "standard", "chat"],
    description: "Llama 3.2 3B — Meta's highly efficient model for general interaction.",
    best_for: "Quick chat, simple explanations, and high-speed feedback.",
    speed_toks: "12–18 tok/s",
    recommended: false,
  },
};

/** Retrieve a model configuration by registry name. */
export function get(name: string): ModelVariant | undefined {
  return REGISTRY[name];
}

/** The primary model recommended for AXONIZ-ZERO. */
export function recommended(): ModelVariant {
  for (const m of Object.values(REGISTRY)) {
    if (m.recommended) return m;
  }
  return Object.values(REGISTRY)[0];
}

/** Filter the registry for models matching a capability tag. */
export function byTag(tag: string): ModelVariant[] {
  return Object.values(REGISTRY).filter((m) => m.tags.includes(tag));
}

/** All models that can safely operate within the specified RAM limit. */
export function fitsDevice(ramGb = 14.0): ModelVariant[] {
  return Object.values(REGISTRY).filter((m) => fits(m, ramGb));
}

/** Complete list of all registered model variants. */
export function allModels(): ModelVariant[] {
  return Object.values(REGISTRY);
}

/** Render a colour-coded table of available models in the terminal. */
export async function showTable(): Promise<void> {
  // Imported lazily: cli.ts also imports this module.
  const { C } = await import("./cli.js");

  const rows: Array<[string, string, string, string, string]> = [];
  for (const m of Object.values(REGISTRY)) {
    const rec = m.recommended ? " \u2605" : "";
    rows.push([
      m.name + rec,
      `${m.size_gb}GB`,
      m.speed_toks,
      m.tags.slice(0, 3).join(", "),
      m.best_for.slice(0, 45),
    ]);
  }

  const colW = [20, 8, 14, 22, 46];
  const header = ["MODEL", "SIZE", "SPEED (CPU)", "TAGS", "BEST FOR"];

  const sep = `  ${"\u2500".repeat(colW.reduce((a, b) => a + b, 0) + colW.length * 2)}`;
  console.log(`\n${C.BOLD}${C.WHITE}  Available Intelligence Variants${C.RESET}`);
  console.log(sep);
  console.log(
    `  ${header.map((h, i) => `${C.GRAY}${pad(h, colW[i])}${C.RESET}`).join("  ")}`,
  );
  console.log(sep);

  for (const row of rows) {
    const colored = row.map((cell, i) => {
      let color: string;
      if (i === 0) color = cell.includes("\u2605") ? C.BLUE : C.WHITE;
      else if (i === 1) color = C.GRAY;
      else if (i === 2) color = C.GREEN;
      else if (i === 3) color = C.PURPLE;
      else color = C.DGRAY;
      return `${color}${pad(cell, colW[i])}${C.RESET}`;
    });
    console.log(`  ${colored.join("  ")}`);
  }

  console.log(sep);
  console.log(
    `  ${C.DGRAY}\u2605 = Standard Recommendation  \u00b7  Command: axoniz model use <name>${C.RESET}\n`,
  );
}

/** Left-truncation-safe column padding (matches Python's str.ljust). */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
