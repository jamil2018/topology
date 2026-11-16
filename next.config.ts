import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(undefined, process.env.NODE_ENV === "development") }];
  },
  transpilePackages: ["@topology/domain"],
  serverExternalPackages: ["postgres", "@aws-sdk/client-s3"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
