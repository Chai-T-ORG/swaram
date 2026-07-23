import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@huggingface/transformers"],
  serverExternalPackages: ["onnxruntime-node", "kokoro-js"],
  // Don't advertise the framework in a response header.
  poweredByHeader: false,
  // Tree-shake these barrel-export libraries so only the icons/animations that
  // are actually used land in each route's bundle instead of the whole package.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // Client-side router-cache retention. Every route here is dynamic (the root
    // layout reads the device UA header), and Next's default keeps dynamic
    // navigations for 0s — so switching home ⇄ my forms ⇄ profile, or going
    // back, re-fetched the RSC from the server every time. These pages hold no
    // server data (they hydrate from localStorage via SWR, which revalidates on
    // its own), so caching the navigation is safe AND makes switching instant.
    staleTimes: {
      dynamic: 60, // reuse a visited page's segment for 60s
      static: 300,
    },
    // Desktop: fully prefetch a dynamic route when the user hovers its link, so
    // the click lands with no server round-trip.
    dynamicOnHover: true,
  },
  // Serve modern formats (AVIF/WebP) via Vercel Image Optimization for anything
  // routed through next/image.
  images: {
    formats: ["image/avif", "image/webp"],
  },
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
        // API responses carry per-user content (transcripts, synthesized
        // speech, LLM replies, short-lived tokens). The previous blanket
        // `public, s-maxage=60` invited shared caches (CDN/proxy) to store
        // one user's data and serve it to another. Default to no-store; any
        // route that is genuinely cacheable can opt back in from its handler.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
