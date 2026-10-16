#!/usr/bin/env python3
"""Replace streamAgentChat in cli-bridge.ts with a version that has a direct HTTP proxy fallback."""
import re
import base64
import json
import sys

content = open('/tmp/cli-bridge.ts').read()

new_func = '''export async function* streamAgentChat(message: string, history?: Array<{ role: string; content: string }>): AsyncGenerator<string> {
  // Try the CLI agent first (requires dist/ to be built)
  try {
    const agent = createAgent();
    for await (const tok of agent.chatStream(message)) {
      yield tok;
    }
    return;
  } catch (e) {
    // Agent module unavailable (dist/ not built) — fall back to direct HTTP proxy.
    console.warn('[chat] CLI agent unavailable, using direct proxy fallback:', e instanceof Error ? e.message : String(e));
  }

  // Direct HTTP proxy fallback — reads config and proxies to the provider
  const config = loadCliConfig();
  const llm = (config as Record<string, unknown>)?.llm as {
    active_provider?: string;
    providers?: Record<string, {
      base_url?: string;
      api_key?: string;
      model_name?: string;
      model_path?: string;
    }>;
  } | undefined;

  const provider = llm?.active_provider ?? "llamacpp";
  const providerCfg = llm?.providers?.[provider] ?? {};
  const baseUrl = providerCfg.base_url ?? "http://localhost:8080";
  const apiKey = providerCfg.api_key;
  const model = providerCfg.model_name ?? providerCfg.model_path ?? "unknown";

  const messages = [
    ...(history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: message },
  ];

  const url = baseUrl.endsWith("/v1")
    ? baseUrl + "/chat/completions"
    : baseUrl + "/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error("Provider returned " + response.status + ": " + text.slice(0, 200));
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch { /* skip malformed SSE */ }
      }
    }
  }
}'''

# Find the old function and replace it
old_start = content.find('export async function* streamAgentChat')
if old_start == -1:
    print("ERROR: could not find streamAgentChat function", file=sys.stderr)
    sys.exit(1)

# Find the end of the old function (next export or end of function block)
# The function is: export async function* streamAgentChat(...) { ... }
# We need to find the matching closing brace
brace_count = 0
i = old_start
found_open = False
while i < len(content):
    if content[i] == '{':
        brace_count += 1
        found_open = True
    elif content[i] == '}':
        brace_count -= 1
        if found_open and brace_count == 0:
            end = i + 1
            break
    i += 1

old_func = content[old_start:end]
new_content = content[:old_start] + new_func + content[end:]

with open('/tmp/cli-bridge-new.ts', 'w') as f:
    f.write(new_content)

# Verify
if "Direct HTTP proxy fallback" not in new_content:
    print("ERROR: replacement text not found in output", file=sys.stderr)
    sys.exit(1)

# Base64 encode for GitHub API
b64 = base64.b64encode(new_content.encode()).decode()

# Save the SHA + b64 for the next step
print("SUCCESS")
print("sha_input:will_be_provided")
print("b64_length:" + str(len(b64)))
with open('/tmp/cli-bridge-b64.txt', 'w') as f:
    f.write(b64)
