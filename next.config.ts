import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(undefined, process.env.NODE_ENV === "development") }];
  },
  transpilePackages: ["@topology/domain"],
  // Domain (and other workspace packages) use NodeNext `.js` import specifiers in
  // TypeScript source; map those to `.ts` while Next transpilePackages the sources.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  // Allow `next build` (Turbopack-by-default) alongside the webpack-only alias above.
  turbopack: {},
  serverExternalPackages: ["postgres", "@aws-sdk/client-s3"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
