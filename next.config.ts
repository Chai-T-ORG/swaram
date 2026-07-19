import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@huggingface/transformers"],
  serverExternalPackages: ["onnxruntime-node", "kokoro-js"],
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
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|png|webp|ico|woff2|onnx|wasm|bin)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, s-maxage=31536000, immutable",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
