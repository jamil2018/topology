import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const isAuthRoute =
        pathname.startsWith("/login") || pathname.startsWith("/api/auth");
      const isCiApi = pathname.startsWith("/api/ci");
      const isAgentApi = pathname.startsWith("/api/agent");

      if (isAuthRoute || isCiApi || isAgentApi) return true;
      if (pathname.startsWith("/_next")) return true;
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
} satisfies NextAuthConfig;
