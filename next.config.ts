import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(undefined, process.env.NODE_ENV === "development") }];
  },
  // @topology/domain is consumed from its built dist/ (package exports). Do not
  // transpile its TypeScript sources — NodeNext `.js` import specifiers there
  // are valid only after `tsc` emit.
  serverExternalPackages: ["postgres", "@aws-sdk/client-s3"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
