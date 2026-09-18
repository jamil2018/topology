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

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
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
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const user = await db.query.users.findFirst({
        where: eq(users.email, parsed.data.email.toLowerCase()),
      });
      if (!user?.passwordHash) return null;

      const valid = await compare(parsed.data.password, user.passwordHash);
      if (!valid) return null;

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
