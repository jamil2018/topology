"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { safeCallbackPath } from "@/lib/safe-callback-path";

export function LoginForm({
  oauth,
  airGap,
  setup = false,
  demoHint = false,
  callbackUrl = "/",
}: {
  oauth: {
    github: boolean;
    google: boolean;
    oidc?: boolean;
    oidcName?: string;
  };
  airGap: boolean;
  setup?: boolean;
  demoHint?: boolean;
  callbackUrl?: string;
}) {
  const next = safeCallbackPath(callbackUrl);
  const oauthAvailable = oauth.github || oauth.google || Boolean(oauth.oidc);
  const [showEmail, setShowEmail] = useState(!oauthAvailable || setup);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  async function onSetup() {
    setLoading(true);
    setError(null);
    if (password !== confirmPassword) {
      setLoading(false);
      setError("Passwords do not match");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLoading(false);
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (!res.ok) {
      setLoading(false);
      setError(
        typeof data.error === "string"
          ? data.error
          : "Could not create the first admin",
      );
      return;
    }
    const signed = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: next,
    });
    setLoading(false);
    if (signed?.error) {
      setError("Admin created. Sign in from the login page.");
      return;
    }
    window.location.href = next;
  }

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

  const supportLine = setup
    ? "Create the first admin for this instance. Next: create a case, start a run, import CI, then file issues from triage."
    : airGap
      ? "Air-gapped mode. Sign in with email and password for local operators."
      : oauthAvailable
        ? "Continue with your identity provider. Email stays available as a fallback."
        : "Configure OAuth or OIDC, or sign in with email for local operators.";

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
        {!setup && oauthAvailable ? (
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
            {oauth.oidc ? (
              <Button
                className="w-full"
                variant="primary"
                onPress={() => signIn("oidc", { callbackUrl: next })}
              >
                Continue with {oauth.oidcName || "OIDC"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!setup && oauthAvailable && !showEmail ? (
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
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {!setup && oauthAvailable ? (
                <div className="relative py-1 text-center text-xs text-[color:var(--topo-muted)]">
                  <span className="bg-transparent px-2">Email fallback</span>
                </div>
              ) : null}
              {setup ? (
                <TextField name="name" className="w-full">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full"
                    autoComplete="name"
                  />
                </TextField>
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
                  autoComplete={setup ? "new-password" : "current-password"}
                />
              </TextField>
              {setup ? (
                <TextField
                  name="confirmPassword"
                  type="password"
                  className="w-full"
                >
                  <Label>Confirm password</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full"
                    autoComplete="new-password"
                  />
                </TextField>
              ) : null}
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
                variant={oauthAvailable && !setup ? "secondary" : "primary"}
                isDisabled={loading}
                onPress={() => void (setup ? onSetup() : onCredentials())}
              >
                {loading
                  ? setup
                    ? "Creating admin…"
                    : "Signing in…"
                  : setup
                    ? "Create admin"
                    : "Sign in with email"}
              </Button>
              {!setup && oauthAvailable ? (
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

        {setup ? (
          <div className="space-y-1.5 text-xs text-[color:var(--topo-muted)]">
            <p>Password must be at least {MIN_PASSWORD_LENGTH} characters.</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Create a case</li>
              <li>Start a run</li>
              <li>Import CI results</li>
              <li>File an issue from triage</li>
            </ol>
          </div>
        ) : demoHint && !oauthAvailable ? (
          <p className="font-mono text-[11px] text-[color:var(--topo-muted)]">
            Local seed login: demo@topology.local / topology-demo
          </p>
        ) : demoHint && showEmail ? (
          <p className="font-mono text-[11px] text-[color:var(--topo-muted)]">
            Local seed login: demo@topology.local / topology-demo
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
