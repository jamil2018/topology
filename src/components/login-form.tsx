"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

export function LoginForm({
  oauth,
  airGap,
}: {
  oauth: { github: boolean; google: boolean };
  airGap: boolean;
}) {
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
      callbackUrl: "/",
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    window.location.href = "/";
  }

  const supportLine = airGap
    ? "Air-gapped mode. Sign in with email and password for local operators."
    : oauthAvailable
      ? "Continue with GitHub or Google. Email stays available as a fallback."
      : "Configure OAuth for GitHub or Google, or sign in with email for local operators.";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[26rem] space-y-8"
    >
      <header className="space-y-4">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: reduceMotion ? 0 : 0.04,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="flex items-center gap-3"
        >
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
        </motion.div>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.45,
            delay: reduceMotion ? 0 : 0.1,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="max-w-[34ch] text-[0.95rem] leading-relaxed text-[color:var(--topo-muted)]"
        >
          {supportLine}
        </motion.p>
      </header>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.45,
          delay: reduceMotion ? 0 : 0.16,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="space-y-4"
      >
        {oauthAvailable ? (
          <div className="space-y-2">
            {oauth.github ? (
              <Button
                className="w-full"
                variant="primary"
                onPress={() => signIn("github", { callbackUrl: "/" })}
              >
                Continue with GitHub
              </Button>
            ) : null}
            {oauth.google ? (
              <Button
                className="w-full"
                variant="primary"
                onPress={() => signIn("google", { callbackUrl: "/" })}
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
      </motion.div>
    </motion.div>
  );
}
