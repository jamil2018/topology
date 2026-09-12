"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { motion } from "motion/react";
import { ThemeToggle } from "./theme-toggle";

export function LoginForm({
  oauth,
}: {
  oauth: { github: boolean; google: boolean };
}) {
  const [email, setEmail] = useState("demo@topology.local");
  const [password, setPassword] = useState("topology-demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full max-w-md space-y-5 rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
            Sign in
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--topo-ink)]">
            Topology
          </h1>
          <p className="mt-1.5 text-sm text-[color:var(--topo-muted)]">
            OAuth-first when configured. Email and password for local operators.
          </p>
        </div>
        <ThemeToggle compact />
      </div>

      {(oauth.github || oauth.google) && (
        <div className="space-y-2">
          {oauth.github ? (
            <Button
              className="w-full"
              variant="secondary"
              onPress={() => signIn("github", { callbackUrl: "/" })}
            >
              Continue with GitHub
            </Button>
          ) : null}
          {oauth.google ? (
            <Button
              className="w-full"
              variant="secondary"
              onPress={() => signIn("google", { callbackUrl: "/" })}
            >
              Continue with Google
            </Button>
          ) : null}
          <div className="relative py-2 text-center text-xs text-[color:var(--topo-muted)]">
            <span className="bg-[color:var(--topo-panel)] px-2">or email</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <TextField name="email" type="email" className="w-full">
          <Label>Email</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full"
          />
        </TextField>
        <TextField name="password" type="password" className="w-full">
          <Label>Password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full"
          />
        </TextField>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <Button
          className="w-full"
          variant="primary"
          isDisabled={loading}
          onPress={() => void onCredentials()}
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </div>

      <p className="font-mono text-[11px] text-[color:var(--topo-muted)]">
        demo@topology.local / topology-demo
      </p>
    </motion.div>
  );
}
