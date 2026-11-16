import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest, type NextMiddleware } from "next/server";
import { authConfig } from "@/auth.config";
import { securityHeaders } from "@/lib/security-headers";

const passThrough: NextMiddleware = () => NextResponse.next();
const authenticate = NextAuth(authConfig).auth(passThrough);

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await authenticate(request, event);
  // Deployment origin is runtime configuration in a standalone image. Do not
  // bake HSTS into the build or trust an arbitrary forwarded-proto request.
  const hsts = securityHeaders(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)
    .find(({ key }) => key === "Strict-Transport-Security");
  if (response && hsts) response.headers.set(hsts.key, hsts.value);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
