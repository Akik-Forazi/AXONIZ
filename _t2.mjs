import { listModels } from "@huggingface/hub";
const it = listModels({ search: { query: "gguf" }, limit: 3, additionalFields: ["downloads","likes","lastModified"] });
const out = [];
for await (const m of it) out.push(m);
console.log(JSON.stringify(out, null, 2).slice(0, 1200));
