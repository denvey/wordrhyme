import type { NextConfig } from "next";

/**
 * Next.js Configuration for WordRhyme Web App
 *
 * MVP Note: Module Federation 2.0 SSR integration has compatibility issues with
 * Next.js 15 Pages Router. For MVP, plugin UI will be loaded client-side only
 * using dynamic imports. Full MF2.0 SSR support is deferred to a future version.
 *
 * See design.md Phase 5.5 for the planned implementation.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Transpile @wordrhyme packages for proper module resolution
   */
  transpilePackages: ["@wordrhyme/ui"],

  /**
   * Image optimization domains
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  /**
   * Redirect to API server for tRPC calls
   */
  async rewrites() {
    return [
      {
        source: "/trpc/:path*",
        destination: "http://localhost:3000/trpc/:path*",
      },
    ];
  },
};

export default nextConfig;
