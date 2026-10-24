import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { credentialStamp, jwtMatchesCredentials } from "@/auth-session";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  loginRateLimitIdentifier,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { oidcProviderConfigured, oidcProviderName } from "@/lib/oidc-env";
import { passwordSchema } from "@/lib/password";
import { clientIp } from "@/lib/request-meta";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
});

const providers = [
  ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
      ]
    : []),
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
      ]
    : []),
  ...(oidcProviderConfigured()
    ? [
        {
          id: "oidc",
          name: oidcProviderName(),
          type: "oidc" as const,
          issuer: process.env.AUTH_OIDC_ISSUER,
          clientId: process.env.AUTH_OIDC_ID,
          clientSecret: process.env.AUTH_OIDC_SECRET,
        },
      ]
    : []),
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const email = parsed.data.email.toLowerCase();
      const ip = clientIp(request);
      const rateId = loginRateLimitIdentifier(email, ip);

      try {
        const limited = await checkLoginRateLimit(rateId);
        if (limited.blocked) {
          await recordAuditEvent({
            action: "login.failure",
            actorEmail: email,
            request,
            metadata: { reason: "rate_limited" },
          });
          return null;
        }
      } catch (err) {
        console.error("Login rate limit check failed", err);
      }

      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (!user?.passwordHash) {
        try {
          await recordLoginFailure(rateId);
        } catch (err) {
          console.error("Login rate limit record failed", err);
        }
        await recordAuditEvent({
          action: "login.failure",
          actorEmail: email,
          request,
          metadata: { reason: "unknown_user" },
        });
        return null;
      }

      const valid = await compare(parsed.data.password, user.passwordHash);
      if (!valid) {
        try {
          await recordLoginFailure(rateId);
        } catch (err) {
          console.error("Login rate limit record failed", err);
        }
        await recordAuditEvent({
          action: "login.failure",
          actorId: user.id,
          actorEmail: email,
          request,
          metadata: { reason: "bad_password" },
        });
        return null;
      }

      try {
        await clearLoginRateLimit(rateId);
      } catch (err) {
        console.error("Login rate limit clear failed", err);
      }
      await recordAuditEvent({
        action: "login.success",
        actorId: user.id,
        actorEmail: email,
        request,
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user?.id) token.sub = user.id;
      const userId = token.sub;
      if (!userId) return null;

      const row = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { passwordHash: true },
      });

      // Stamp only when Auth.js issues the token. Refreshing this claim on
      // later reads would re-authorize a cookie after the password changed.
      if (trigger === "signIn" || trigger === "signUp") {
        token.credentialsVersion = credentialStamp(row?.passwordHash);
        return token;
      }

      if (
        !row ||
        !jwtMatchesCredentials(token.credentialsVersion, row.passwordHash)
      ) {
        return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token.sub) return session;

      const user = await db.query.users.findFirst({
        where: eq(users.id, token.sub),
        columns: { id: true, email: true, name: true, image: true },
      });
      // JWT can outlive the user row (database reset, or a different local volume).
      if (!user) {
        return { expires: session.expires };
      }

      session.user.id = user.id;
      session.user.email = user.email;
      session.user.name = user.name;
      session.user.image = user.image;
      return session;
    },
  },
});
