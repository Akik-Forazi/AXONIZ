import { listModels, listFiles } from "@huggingface/hub";
const out = [];
for await (const m of listModels({ search: { query: "gguf" }, limit: 2 })) out.push(m);
console.log("listModels sample:", JSON.stringify(out[0]).slice(0, 500));
console.log("---");
const files = [];
for await (const f of listFiles({ repo: "bartowski/Llama-3.2-3B-Instruct-GGUF" })) files.push(f.path);
console.log("gguf files:", files.filter(f => f.endsWith(".gguf")).slice(0, 5));
