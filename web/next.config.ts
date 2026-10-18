import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Don't bundle node-cron — it's a native Node.js module that should
  // be resolved at runtime from node_modules/, not bundled by Turbopack.
  // Without this, 'next build' fails with "Module not found: Can't resolve 'node-cron'".
  serverExternalPackages: ["node-cron"],
};

export default nextConfig;
