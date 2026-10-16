// Stub for tree-sitter-graphql.
//
// The upstream 1.0.0 release uses the Node 12 V8 C++ API in its
// binding.cc and fails to native-compile on Node 22+ (which AXONIZ
// requires for the built-in node:sqlite module). This stub replaces
// the upstream package via npm `overrides` so plain `npm ci` (no
// --ignore-scripts flag) works — letting all OTHER native packages
// (sharp, node-llama-cpp, systeminformation, tree-sitter-* grammar
// packages — which all have prebuilds for linux-x64 + win32-x64)
// run their install scripts normally.
//
// When axodex's parser-loader tries to load this module, the throw
// is caught and axodex reports:
//   "GraphQL parsing requires `tree-sitter-graphql`. Check the install."
// — graceful degradation, no crash. AXONIZ does not parse .graphql
// files in its own source tree, so losing the GraphQL grammar is a
// no-op for AXONIZ's code-graph intelligence engine in practice.
//
// To restore real GraphQL parsing, remove the `overrides` entry in
// the root package.json and downgrade Node to 20.x (but then you
// lose node:sqlite and have to refactor execution-manager.ts).
module.exports = function unsupportedTreeSitterGraphQL() {
  throw new Error(
    "tree-sitter-graphql is stubbed out in this AXONIZ install because " +
    "the upstream 1.0.0 release fails native compilation on Node 22+. " +
    "axodex will report GraphQL parsing as unavailable. " +
    "See scripts/tree-sitter-graphql-stub/package.json for the full story."
  );
};
