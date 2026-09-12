"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@heroui/react";
import { PageHeader } from "./page-header";
import { ConnectAgentPanel } from "./connect-agent-panel";
import { CiSetupPanel } from "./ci-setup-panel";
import { useTheme, type ThemePreference } from "./theme-provider";
import { StatusChip } from "./status-chip";

type SectionId = "profile" | "preferences" | "connections" | "ci";

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "profile", label: "Profile", hint: "Account" },
  { id: "preferences", label: "Preferences", hint: "Theme" },
  { id: "connections", label: "Connections", hint: "MCP" },
  { id: "ci", label: "CI", hint: "Ingest" },
];

function isSection(value: string | null): value is SectionId {
  return (
    value === "profile" ||
    value === "preferences" ||
    value === "connections" ||
    value === "ci"
  );
}

type ProfileState = {
  id: string;
  name: string | null;
  email: string;
  hasPassword: boolean;
};

export function SettingsWorkspace({
  defaultUrl,
  initialSection = "profile",
}: {
  defaultUrl: string;
  initialSection?: SectionId;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const section = isSection(sectionParam) ? sectionParam : initialSection;

  const { preference, setPreference } = useTheme();
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const data = (await res.json()) as {
          profile: ProfileState;
          preferences: { themePreference: ThemePreference };
        };
        if (cancelled) return;
        setProfile(data.profile);
        setName(data.profile.name ?? "");
        if (data.preferences.themePreference !== preference) {
          setPreference(data.preferences.themePreference, { syncServer: false });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only hydrate once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(next: SectionId) {
    router.replace(`/settings?section=${next}`, { scroll: false });
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { name: name.trim() || null } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProfile(data.profile);
      setProfileMsg("Profile saved");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: { currentPassword, newPassword },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Password change failed",
        );
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg("Password updated");
    } catch (err) {
      setPasswordMsg(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveTheme(next: ThemePreference) {
    setPrefsMsg(null);
    setPreference(next);
    setPrefsMsg("Theme preference saved");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Profile, theme, MCP agent connection, and CI ingest setup."
        meta={<StatusChip mono>topology</StatusChip>}
      />

      {loadError ? (
        <p className="text-sm text-red-500">{loadError}</p>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto lg:w-44 lg:flex-col"
          aria-label="Settings sections"
        >
          {SECTIONS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                  active
                    ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className="font-medium">{item.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {item.hint}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {section === "profile" ? (
            <section className="space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                  Profile
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                  Display name and email for this account.
                </p>
              </div>

              <label className="block space-y-1 text-sm">
                <span className="text-[color:var(--topo-muted)]">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-3 py-2 text-sm"
                  autoComplete="name"
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-[color:var(--topo-muted)]">Email</span>
                <input
                  value={profile?.email ?? ""}
                  readOnly
                  className="w-full cursor-default rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)] px-3 py-2 font-mono text-sm text-[color:var(--topo-muted)]"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={savingProfile}
                  onPress={() => void saveProfile()}
                >
                  {savingProfile ? "Saving…" : "Save profile"}
                </Button>
                {profileMsg ? (
                  <span className="text-xs text-[color:var(--topo-muted)]">
                    {profileMsg}
                  </span>
                ) : null}
              </div>

              {profile?.hasPassword ? (
                <div className="space-y-3 border-t border-[color:var(--topo-line)] pt-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                      Change password
                    </h3>
                    <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                      Credential accounts only. Demo login still works after a
                      change if you update the password you use.
                    </p>
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span className="text-[color:var(--topo-muted)]">
                      Current password
                    </span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-3 py-2 text-sm"
                      autoComplete="current-password"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-[color:var(--topo-muted)]">
                      New password
                    </span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-[color:var(--topo-muted)]">
                      Confirm new password
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={savingPassword}
                      onPress={() => void savePassword()}
                    >
                      {savingPassword ? "Updating…" : "Update password"}
                    </Button>
                    {passwordMsg ? (
                      <span className="text-xs text-[color:var(--topo-muted)]">
                        {passwordMsg}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="border-t border-[color:var(--topo-line)] pt-4 text-xs text-[color:var(--topo-muted)]">
                  This account signs in with OAuth — password change is not
                  available.
                </p>
              )}
            </section>
          ) : null}

          {section === "preferences" ? (
            <section className="space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                  Preferences
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                  Theme syncs with the sidebar toggle. Logged-in preference is
                  stored server-side;{" "}
                  <code className="font-mono">localStorage</code> key{" "}
                  <code className="font-mono">topology-theme</code> remains the
                  fast client fallback (and for signed-out views).
                </p>
              </div>

              <div
                className="grid grid-cols-3 gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-1"
                role="group"
                aria-label="Color theme"
              >
                {(["system", "light", "dark"] as const).map((mode) => {
                  const active = preference === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => void saveTheme(mode)}
                      className={`rounded-[5px] px-2 py-2 text-xs font-medium capitalize transition-colors ${
                        active
                          ? "bg-[color:var(--topo-panel)] text-[color:var(--topo-ink)] shadow-sm"
                          : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                      }`}
                      aria-pressed={active}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
              {prefsMsg ? (
                <p className="text-xs text-[color:var(--topo-muted)]">{prefsMsg}</p>
              ) : null}
            </section>
          ) : null}

          {section === "connections" ? (
            <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
              <ConnectAgentPanel defaultUrl={defaultUrl} compact />
            </section>
          ) : null}

          {section === "ci" ? (
            <section className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                  CI ingest
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                  Token and docs for automation ingest.
                </p>
              </div>
              <CiSetupPanel />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
