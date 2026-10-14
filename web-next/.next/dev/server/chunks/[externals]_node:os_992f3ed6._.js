module.exports = [
"[externals]/node:os [external] (node:os, cjs, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/[externals]_node:os_276398f1._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[externals]/node:os [external] (node:os, cjs)");
    });
});
}),
];