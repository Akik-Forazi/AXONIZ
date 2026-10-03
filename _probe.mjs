async function probe(name, url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const buf = await r.arrayBuffer();
    console.log(`${name.padEnd(14)} ${r.status}  ${(buf.byteLength/1024).toFixed(0)}KB  ${Date.now()-t0}ms`);
  } catch (e) {
    console.log(`${name.padEnd(14)} FAIL  ${Date.now()-t0}ms  ${e.message}`);
  }
}
await probe("metadata", "https://registry.npmjs.org/picocolors/latest");
await probe("tarball-small", "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz");
await probe("tarball-big", "https://registry.npmjs.org/node-llama-cpp/-/node-llama-cpp-3.22.1.tgz");
