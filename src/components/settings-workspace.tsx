"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label, TextField } from "@heroui/react";
import { PageHeader } from "./page-header";
import { ConnectAgentPanel } from "./connect-agent-panel";
import { CiSetupPanel } from "./ci-setup-panel";
import { RepositoriesPanel } from "./repositories-panel";
import { WebhooksPanel } from "./webhooks-panel";
import { InboundIssueSyncPanel } from "./inbound-issue-sync-panel";
import { NotificationChannelsPanel } from "./notification-channels-panel";
import { useTheme, type ThemePreference } from "./theme-provider";
import { useQualityGraph } from "./quality-graph-provider";
import { useProjectActions } from "./project-actions";
import { WorkspaceMembersPanel } from "./workspace-members-panel";
import { CustomRolesPanel } from "./custom-roles-panel";
import { ProjectsPanel } from "./projects-panel";
import { AiSettingsPanel } from "./ai-settings-panel";
import { ApiTokensPanel } from "./api-tokens-panel";
import { AuditLogPanel } from "./audit-log-panel";
import { CustomFieldsPanel } from "./custom-fields-panel";
import { SharedStepsPanel } from "./shared-steps-panel";
import { TopoDisclosure } from "./ui/topo-disclosure";
import {
  SETTINGS_NAV,
  isLegacySettingsSection,
  resolveSettingsSection,
  settingsHref,
  type SettingsPageId,
} from "@/lib/settings-sections";

type ProfileState = {
  id: string;
  name: string | null;
  email: string;
  hasPassword: boolean;
};

export function SettingsWorkspace({
  defaultUrl,
  initialSection = "account",
}: {
  defaultUrl: string;
  initialSection?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const resolved = resolveSettingsSection(sectionParam ?? initialSection);
  const page: SettingsPageId = resolved.page;

  const { preference, setPreference } = useTheme();
  const {
    enabled: qualityGraphEnabled,
    setEnabled: setQualityGraphEnabled,
  } = useQualityGraph();
  const { canAdmin } = useProjectActions();
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

  // Canonicalize legacy ?section= tabs into the merged pages (+ anchors).
  useEffect(() => {
    const raw = searchParams.get("section");
    if (!isLegacySettingsSection(raw)) return;
    const next = resolveSettingsSection(raw);
    router.replace(settingsHref(next.page, next.anchor), { scroll: false });
  }, [searchParams, router]);

  // Scroll to in-page anchors from deep links / legacy redirects.
  useEffect(() => {
    let frame = 0;
    function revealAnchor() {
      const anchor = window.location.hash.slice(1) || resolved.anchor;
      if (!anchor) return;
      const el = document.getElementById(anchor);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        el.scrollIntoView({ block: "start" });
      });
    }
    revealAnchor();
    window.addEventListener("hashchange", revealAnchor);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", revealAnchor);
    };
  }, [page, resolved.anchor, searchParams]);

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
        description="Account, projects, access, and integrations for this Topology workspace."

      />

      {loadError ? (
        <p className="text-sm text-red-500 dark:text-red-400">{loadError}</p>
      ) : null}

      <div className="space-y-4">
        <nav
          className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
          aria-label="Settings"
        >
          <ul className="flex flex-wrap items-stretch gap-0 border-b border-[color:var(--topo-line)]">
            {SETTINGS_NAV.map((item) => {
              const active = page === item.id;
              return (
                <li key={item.id} className="shrink-0">
                  <Link
                    href={settingsHref(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors sm:px-4 ${
                      active
                        ? "border-[color:var(--topo-accent)] text-[color:var(--topo-ink)]"
                        : "border-transparent text-[color:var(--topo-muted)] hover:border-[color:var(--topo-line)] hover:text-[color:var(--topo-ink)]"
                    }`}
                  >
                    <span className="font-medium whitespace-nowrap">
                      {item.label}
                    </span>

                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4" id={`settings-panel-${page}`}>
          {page === "account" ? (
            <>
              <section
                id="profile"
                className="scroll-mt-4 space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    Profile
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    Display name and email for this account.
                  </p>
                </div>

                <TextField name="profile-name" className="w-full" variant="secondary">
                  <Label className="text-[color:var(--topo-muted)]">Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full"
                    autoComplete="name"
                  />
                </TextField>

                <TextField name="profile-email" className="w-full" variant="secondary" isReadOnly>
                  <Label className="text-[color:var(--topo-muted)]">Email</Label>
                  <Input
                    value={profile?.email ?? ""}
                    className="w-full cursor-default font-mono text-[color:var(--topo-muted)]"
                  />
                </TextField>

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

                {profile == null ? null : profile.hasPassword ? (
                  <div className="space-y-3 border-t border-[color:var(--topo-line)] pt-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                        Change password
                      </h3>
                      <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                        Credential accounts only. New passwords must be at least
                        12 characters.
                      </p>
                    </div>
                    <TextField name="current-password" className="w-full" variant="secondary" type="password">
                      <Label className="text-[color:var(--topo-muted)]">
                        Current password
                      </Label>
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full"
                        autoComplete="current-password"
                      />
                    </TextField>
                    <TextField name="new-password" className="w-full" variant="secondary" type="password">
                      <Label className="text-[color:var(--topo-muted)]">
                        New password
                      </Label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full"
                        autoComplete="new-password"
                      />
                    </TextField>
                    <TextField name="confirm-password" className="w-full" variant="secondary" type="password">
                      <Label className="text-[color:var(--topo-muted)]">
                        Confirm new password
                      </Label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full"
                        autoComplete="new-password"
                      />
                    </TextField>
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

              <section
                id="preferences"
                className="scroll-mt-4 space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    Preferences
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    Theme follows the sidebar toggle. Your signed-in choice is
                    saved to this account and applies on every device.
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
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={active ? "secondary" : "ghost"}
                        onPress={() => void saveTheme(mode)}
                        className={`rounded-[5px] px-2 py-2 text-xs font-medium capitalize ${
                          active
                            ? "bg-[color:var(--topo-panel)] text-[color:var(--topo-ink)] shadow-sm"
                            : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                        }`}
                        aria-pressed={active}
                      >
                        {mode}
                      </Button>
                    );
                  })}
                </div>
                {prefsMsg ? (
                  <p className="text-xs text-[color:var(--topo-muted)]">
                    {prefsMsg}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}

          {page === "projects" ? (
            <>
              <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
                <ProjectsPanel />
              </section>
              {canAdmin ? (
                <section
                  id="quality-graph"
                  className="scroll-mt-4 space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                      Advanced Quality Graph
                    </h2>
                    <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                      Show intents, releases, journeys, requirements, risks, and
                      components in the sidebar for everyone in this workspace.
                      Milestones, impact, and proposals stay in the main nav
                      either way.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={qualityGraphEnabled ? "secondary" : "tertiary"}
                    aria-pressed={qualityGraphEnabled}
                    onPress={() => {
                      setQualityGraphEnabled(!qualityGraphEnabled);
                      setPrefsMsg(
                        qualityGraphEnabled
                          ? "Quality graph hidden from the sidebar"
                          : "Quality graph shown in the sidebar",
                      );
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      qualityGraphEnabled
                        ? "topo-selected-surface"
                        : "border border-[color:var(--topo-line)] text-[color:var(--topo-muted)]"
                    }`}
                  >
                    {qualityGraphEnabled
                      ? "Quality graph on"
                      : "Quality graph off"}
                  </Button>
                  {prefsMsg ? (
                    <p className="text-xs text-[color:var(--topo-muted)]">
                      {prefsMsg}
                    </p>
                  ) : null}
                </section>
              ) : null}
              <section className="scroll-mt-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
                <CustomFieldsPanel />
              </section>
              <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
                <SharedStepsPanel />
              </section>
            </>
          ) : null}

          {page === "access" ? (
            <>
              <section
                id="members"
                className="scroll-mt-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
              >
                <WorkspaceMembersPanel />
              </section>

              <section
                id="roles"
                className="scroll-mt-4 space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    Roles
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    System and custom roles are action allow-lists enforced on
                    the server. Assign roles to members above.
                  </p>
                </div>
                <CustomRolesPanel />
              </section>
            </>
          ) : null}

          {page === "integrations" ? (
            <>
              <TopoDisclosure
                id="agent"
                bordered
                className="scroll-mt-4 space-y-3 p-4"
                title="Connect an agent"
                summary={
                  <span className="mt-1 block text-sm font-normal text-[color:var(--topo-muted)]">
                    Set up an AI assistant to work with your tests.
                  </span>
                }
                bodyClassName="mt-4 space-y-3"
              >
                <ConnectAgentPanel defaultUrl={defaultUrl} compact />
              </TopoDisclosure>

              <TopoDisclosure
                id="ci"
                bordered
                className="scroll-mt-4 space-y-3 p-4"
                title="Import automated results"
                summary={
                  <span className="mt-1 block text-sm font-normal text-[color:var(--topo-muted)]">
                    Send test results from your CI pipeline.
                  </span>
                }
                bodyClassName="mt-4 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    CI ingest
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    Token and docs for automation ingest.
                  </p>
                </div>
                <CiSetupPanel />
              </TopoDisclosure>

              <TopoDisclosure
                id="repositories"
                bordered
                className="scroll-mt-4 space-y-3 p-4"
                title="Repositories"
                summary={
                  <span className="mt-1 block text-sm font-normal text-[color:var(--topo-muted)]">
                    Connect source code for change impact analysis.
                  </span>
                }
                bodyClassName="mt-4 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    Repositories
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    Connect remotes, webhooks, and path rules for change impact.
                  </p>
                </div>
                <RepositoriesPanel defaultUrl={defaultUrl} />
              </TopoDisclosure>

              <TopoDisclosure
                id="ai"
                bordered
                className="scroll-mt-4 space-y-3 p-4"
                title="AI drafting"
                summary={
                  <span className="mt-1 block text-sm font-normal text-[color:var(--topo-muted)]">
                    Optional assistance with writing test proposals.
                  </span>
                }
                bodyClassName="mt-4 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    AI (optional)
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    Topology works without an LLM. When enabled, drafting jobs
                    queue proposals for human review — never direct graph writes.
                  </p>
                </div>
                <AiSettingsPanel />
              </TopoDisclosure>

              <TopoDisclosure
                id="webhooks"
                bordered
                className="scroll-mt-4 space-y-3 p-4"
                title="Webhooks"
                summary={
                  <span className="mt-1 block text-sm font-normal text-[color:var(--topo-muted)]">
                    Notify other tools when testing activity changes.
                  </span>
                }
                bodyClassName="mt-4 space-y-3"
              >
                <WebhooksPanel />
              </TopoDisclosure>

              <TopoDisclosure
                id="inbound"
                bordered
                className="scroll-mt-4 space-y-3 p-4"
                title="Inbound issue sync"
                summary={
                  <span className="mt-1 block text-sm font-normal text-[color:var(--topo-muted)]">
                    Receive close / reopen events from Jira, Linear, GitHub, and GitLab.
                  </span>
                }
                bodyClassName="mt-4 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    Inbound issue sync
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    Per-provider webhook URLs and signing verification status.
                  </p>
                </div>
                <InboundIssueSyncPanel defaultUrl={defaultUrl} />
              </TopoDisclosure>

              <TopoDisclosure
                id="notifications"
                bordered
                className="scroll-mt-4 space-y-3 p-4"
                title="Notification channels"
                summary={
                  <span className="mt-1 block text-sm font-normal text-[color:var(--topo-muted)]">
                    Slack, Teams, or email alerts for assignments and run events.
                  </span>
                }
                bodyClassName="mt-4 space-y-3"
              >
                <NotificationChannelsPanel />
              </TopoDisclosure>
            </>
          ) : null}

          {page === "security" ? (
            <>
              <section
                id="tokens"
                className="scroll-mt-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
              >
                <ApiTokensPanel />
              </section>
              <section
                id="audit"
                className="scroll-mt-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
              >
                <AuditLogPanel />
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
