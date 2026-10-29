/** @type {import('next').NextConfig} */
const nextConfig = {
  // The test suite builds into its own directory so it never clobbers a running `npm run dev`.
  distDir: process.env.PRISM_DIST_DIR || ".next",
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["pg"],
  async rewrites() {
    // Public API surface: /graphql and /v1/* are served by route handlers under /api.
    return [
      { source: "/graphql", destination: "/api/graphql" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
};
export default nextConfig;
