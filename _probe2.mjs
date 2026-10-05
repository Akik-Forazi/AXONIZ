const mods = {
  "systeminformation": () => import("systeminformation"),
  "multer": () => import("multer"),
  "express": () => import("express"),
  "js-yaml": () => import("js-yaml"),
  "prom-client": () => import("prom-client"),
  "grammy": () => import("grammy"),
  "jose": () => import("jose"),
  "picocolors": () => import("picocolors"),
  "undici": () => import("undici"),
  "open": () => import("open"),
  "msedge-tts": () => import("msedge-tts"),
  "screenshot-desktop": () => import("screenshot-desktop"),
  "sharp": () => import("sharp"),
  "@modelcontextprotocol/sdk/server/mcp.js": () => import("@modelcontextprotocol/sdk/server/mcp.js"),
  "chromadb": () => import("chromadb"),
};
for (const [name, fn] of Object.entries(mods)) {
  try { const m = await fn(); console.log(`OK    ${name.padEnd(40)} keys=${Object.keys(m).length} default=${"default" in m}`); }
  catch (e) { console.log(`FAIL  ${name.padEnd(40)} ${e.message.split("\n")[0].slice(0,90)}`); }
}
