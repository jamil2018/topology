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
        pathname.startsWith("/login") ||
        pathname.startsWith("/setup") ||
        pathname.startsWith("/api/setup") ||
        pathname.startsWith("/api/auth");
      // These endpoints verify their signed, expiring report token themselves.
      const isSharedReport =
        /^\/share\/reports\/[^/]+$/.test(pathname) ||
        /^\/api\/share\/reports\/[^/]+\/export$/.test(pathname) ||
        /^\/api\/share\/reports\/[^/]+\/attachments\/[^/]+$/.test(pathname);
      const isBearerApi = ["/api/affected", "/api/coverage", "/api/query", "/api/git/ingest"].includes(pathname);
      const isCiApi = pathname.startsWith("/api/ci");
      const isAgentApi = pathname.startsWith("/api/agent") || pathname === "/api/v1/agent";
      const isBearerAttachment =
        /^\/api\/attachments\/[^/]+$/.test(pathname) && request.headers.has("authorization");
      const isExecutionsApi = pathname.startsWith("/api/executions");
      const isReleasesApi = pathname.startsWith("/api/releases");
      const isHealth = pathname === "/api/health" || pathname === "/health";
      const isInviteApi = pathname.startsWith("/api/invites/");
      const isInvitePage = pathname.startsWith("/invite/");
      const isGithubWebhook = pathname.startsWith("/api/webhooks/github");

      if (
        isAuthRoute ||
        isSharedReport ||
        isCiApi ||
        isBearerApi ||
        isAgentApi ||
        isBearerAttachment ||
        isExecutionsApi ||
        isReleasesApi ||
        isHealth ||
        isInviteApi ||
        isInvitePage ||
        isGithubWebhook
      ) {
        return true;
      }
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
