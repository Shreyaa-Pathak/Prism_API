/** @type {import('next').NextConfig} */
const nextConfig = {
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
