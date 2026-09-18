"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { safeCallbackPath } from "@/lib/safe-callback-path";

export function LoginForm({
  oauth,
  airGap,
  callbackUrl = "/",
}: {
  oauth: { github: boolean; google: boolean };
  airGap: boolean;
  callbackUrl?: string;
}) {
  const next = safeCallbackPath(callbackUrl);
  const oauthAvailable = oauth.github || oauth.google;
  const [showEmail, setShowEmail] = useState(!oauthAvailable);
  const [email, setEmail] = useState("demo@topology.local");
  const [password, setPassword] = useState("topology-demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  async function onCredentials() {
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: next,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    window.location.href = next;
  }

  const supportLine = airGap
    ? "Air-gapped mode. Sign in with email and password for local operators."
    : oauthAvailable
      ? "Continue with GitHub or Google. Email stays available as a fallback."
      : "Configure OAuth for GitHub or Google, or sign in with email for local operators.";

  return (
    <motion.div
      initial={reduceMotion ? false : { y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[26rem] space-y-8"
    >
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/mark.png"
            alt=""
            width={44}
            height={44}
            className="shrink-0 object-contain"
            priority
          />
          <h1 className="text-[2.65rem] leading-[1.05] font-semibold tracking-[-0.04em] text-[color:var(--topo-ink)] sm:text-5xl">
            Topology
          </h1>
        </div>
        <p className="max-w-[34ch] text-[0.95rem] leading-relaxed text-[color:var(--topo-muted)]">
          {supportLine}
        </p>
      </header>

      <div className="space-y-4">
        {oauthAvailable ? (
          <div className="space-y-2">
            {oauth.github ? (
              <Button
                className="w-full"
                variant="primary"
                onPress={() => signIn("github", { callbackUrl: next })}
              >
                Continue with GitHub
              </Button>
            ) : null}
            {oauth.google ? (
              <Button
                className="w-full"
                variant="primary"
                onPress={() => signIn("google", { callbackUrl: next })}
              >
                Continue with Google
              </Button>
            ) : null}
          </div>
        ) : null}

        {oauthAvailable && !showEmail ? (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full text-center text-sm text-[color:var(--topo-muted)] underline-offset-2 hover:text-[color:var(--topo-ink)] hover:underline"
          >
            Use email instead
          </button>
        ) : null}

        <AnimatePresence initial={false}>
          {showEmail ? (
            <motion.div
              key="email"
              initial={
                reduceMotion ? false : { opacity: 0, height: 0 }
              }
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {oauthAvailable ? (
                <div className="relative py-1 text-center text-xs text-[color:var(--topo-muted)]">
                  <span className="bg-transparent px-2">Email fallback</span>
                </div>
              ) : null}
              <TextField name="email" type="email" className="w-full">
                <Label>Email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full"
                  autoComplete="username"
                />
              </TextField>
              <TextField name="password" type="password" className="w-full">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full"
                  autoComplete="current-password"
                />
              </TextField>
              {error ? (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {error}
                </p>
              ) : null}
              <Button
                className="w-full"
                variant={oauthAvailable ? "secondary" : "primary"}
                isDisabled={loading}
                onPress={() => void onCredentials()}
              >
                {loading ? "Signing in…" : "Sign in with email"}
              </Button>
              {oauthAvailable ? (
                <button
                  type="button"
                  onClick={() => setShowEmail(false)}
                  className="w-full text-center text-xs text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                >
                  Hide email form
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!oauthAvailable ? (
          <p className="font-mono text-[11px] text-[color:var(--topo-muted)]">
            Demo: demo@topology.local / topology-demo
          </p>
        ) : showEmail ? (
          <p className="font-mono text-[11px] text-[color:var(--topo-muted)]">
            Local demo still works: demo@topology.local / topology-demo
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
