import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Framing is refused in production. In development the header is omitted so the
  // app can be embedded in local preview tooling; every PartScout deployment that
  // serves real users runs with NODE_ENV=production.
  ...(isProduction ? [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] : []),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["cheerio"],
  // The research pipeline fetches arbitrary vendor pages server-side; these are
  // intentionally not used for images so we never proxy untrusted content.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
