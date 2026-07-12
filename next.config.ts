import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@huggingface/transformers"],
  // Kokoro runs server-side for the natural English voice. onnxruntime-node ships
  // a native .node binary, and kokoro-js loads voice .bin files relative to its
  // own package dir — both must stay external requires (not bundled), or the
  // native binding and voice files resolve to a bogus "/ROOT/" path.
  serverExternalPackages: ["onnxruntime-node", "kokoro-js"],
  // opencv.js (WASM) carries a dead Node-environment branch that requires
  // fs/crypto; stub them out so the browser bundle resolves.
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/shims/empty.ts" },
      crypto: { browser: "./lib/shims/empty.ts" },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
