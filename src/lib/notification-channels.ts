import { createConnection } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationChannels, users, type NotificationChannel } from "@/db/schema";
import { assertSafeWebhookDestination, webhookUrlError } from "@/lib/webhooks";

export type NotificationChannelEvent =
  | "assignment"
  | "mention"
  | "run.completed"
  | "coverage.dropped"
  | "proposal.created"
  | "issue.created";

export const NOTIFICATION_CHANNEL_EVENTS: readonly NotificationChannelEvent[] = [
  "assignment",
  "mention",
  "run.completed",
  "coverage.dropped",
  "proposal.created",
  "issue.created",
] as const;

export type NotificationChannelKind = "slack" | "teams" | "smtp";

export type SlackTeamsConfig = {
  url: string;
};

export type SmtpChannelConfig = {
  host: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
  /** Default recipients for channel alerts (comma-separated). */
  to?: string;
};

export type ChannelConfig = SlackTeamsConfig | SmtpChannelConfig;

export type NotificationChannelMessage = {
  event: NotificationChannelEvent;
  title: string;
  body?: string;
  href?: string | null;
  data?: Record<string, unknown>;
};

function parseEvents(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  );
}

export function parseChannelConfigJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function scrubChannelConfig(
  kind: NotificationChannelKind,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === "slack" || kind === "teams") {
    return {
      hasUrl: typeof config.url === "string" && config.url.length > 0,
    };
  }
  return {
    host: typeof config.host === "string" ? config.host : "",
    port:
      typeof config.port === "number"
        ? config.port
        : typeof config.port === "string"
          ? Number(config.port) || undefined
          : undefined,
    secure: Boolean(config.secure),
    user: typeof config.user === "string" ? config.user : "",
    from: typeof config.from === "string" ? config.from : "",
    to: typeof config.to === "string" ? config.to : "",
    hasPass: typeof config.pass === "string" && config.pass.length > 0,
  };
}

export function publicNotificationChannel(row: NotificationChannel) {
  const config = parseChannelConfigJson(row.configJson);
  const { configJson: _configJson, ...rest } = row;
  return {
    ...rest,
    hasConfig: Object.keys(config).length > 0,
    config: scrubChannelConfig(row.kind, config),
  };
}

/** Merge PATCH config onto existing JSON; blank `pass` / `url` keep prior secrets. */
export function mergeChannelConfigJson(
  kind: NotificationChannelKind,
  existingRaw: string,
  patch: Record<string, unknown> | undefined,
): string {
  if (!patch) return existingRaw;
  const existing = parseChannelConfigJson(existingRaw);
  if (kind === "slack" || kind === "teams") {
    const url =
      typeof patch.url === "string" && patch.url.trim()
        ? patch.url.trim()
        : typeof existing.url === "string"
          ? existing.url
          : "";
    return JSON.stringify({ url });
  }
  const next: SmtpChannelConfig = {
    host:
      typeof patch.host === "string" && patch.host.trim()
        ? patch.host.trim()
        : String(existing.host ?? ""),
    port:
      typeof patch.port === "number"
        ? patch.port
        : typeof patch.port === "string" && patch.port.trim()
          ? Number(patch.port)
          : typeof existing.port === "number"
            ? existing.port
            : 587,
    secure:
      typeof patch.secure === "boolean"
        ? patch.secure
        : Boolean(existing.secure),
    user:
      typeof patch.user === "string"
        ? patch.user
        : typeof existing.user === "string"
          ? existing.user
          : "",
    pass:
      typeof patch.pass === "string" && patch.pass.length > 0
        ? patch.pass
        : typeof existing.pass === "string"
          ? existing.pass
          : "",
    from:
      typeof patch.from === "string" && patch.from.trim()
        ? patch.from.trim()
        : String(existing.from ?? ""),
    to:
      typeof patch.to === "string"
        ? patch.to
        : typeof existing.to === "string"
          ? existing.to
          : "",
  };
  return JSON.stringify(next);
}

export function validateChannelConfig(
  kind: NotificationChannelKind,
  config: Record<string, unknown>,
): string | null {
  if (kind === "slack" || kind === "teams") {
    const url = typeof config.url === "string" ? config.url.trim() : "";
    if (!url) return "Webhook URL is required";
    return webhookUrlError(url);
  }
  const host = typeof config.host === "string" ? config.host.trim() : "";
  const from = typeof config.from === "string" ? config.from.trim() : "";
  if (!host) return "SMTP host is required";
  if (!from) return "SMTP from address is required";
  return null;
}

function appBaseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.TOPOLOGY_URL ??
    "http://127.0.0.1:4317"
  ).replace(/\/$/, "");
}

export function formatChannelMessage(
  event: NotificationChannelEvent,
  data: Record<string, unknown>,
): NotificationChannelMessage {
  const base = appBaseUrl();
  if (event === "assignment") {
    const title =
      typeof data.title === "string"
        ? data.title
        : "You were assigned work in Topology";
    const body = typeof data.body === "string" ? data.body : undefined;
    const entityType = typeof data.entityType === "string" ? data.entityType : null;
    const entityId = typeof data.entityId === "string" ? data.entityId : null;
    let href: string | null = null;
    if (entityType === "run" && entityId) href = `${base}/runs/${entityId}`;
    if (entityType === "result" && entityId && typeof data.runId === "string") {
      href = `${base}/runs/${data.runId}?result=${entityId}`;
    }
    return { event, title, body, href, data };
  }
  if (event === "mention") {
    return {
      event,
      title:
        typeof data.title === "string"
          ? data.title
          : "You were mentioned in a comment",
      body: typeof data.body === "string" ? data.body : undefined,
      href: null,
      data,
    };
  }
  if (event === "run.completed") {
    const run = (data.run ?? {}) as Record<string, unknown>;
    const summary = (data.summary ?? {}) as Record<string, unknown>;
    const name = typeof run.name === "string" ? run.name : "Run";
    const id = typeof run.id === "string" ? run.id : null;
    const failed = typeof summary.failed === "number" ? summary.failed : 0;
    const passed = typeof summary.passed === "number" ? summary.passed : 0;
    const total = typeof summary.total === "number" ? summary.total : 0;
    return {
      event,
      title: `Run completed: ${name}`,
      body: `${passed} passed, ${failed} failed of ${total}`,
      href: id ? `${base}/runs/${id}` : null,
      data,
    };
  }
  if (event === "proposal.created") {
    const proposalId =
      typeof data.proposalId === "string" ? data.proposalId : null;
    const entityType =
      typeof data.entityType === "string" ? data.entityType : "entity";
    const diffCount =
      typeof data.diffCount === "number" ? data.diffCount : null;
    return {
      event,
      title: "New proposal",
      body:
        diffCount != null
          ? `${entityType} · ${diffCount} change${diffCount === 1 ? "" : "s"}`
          : `Proposed ${entityType} update`,
      href: proposalId ? `${base}/proposals` : `${base}/proposals`,
      data,
    };
  }
  if (event === "issue.created") {
    const issue = (data.issue ?? {}) as Record<string, unknown>;
    const result = (data.result ?? {}) as Record<string, unknown>;
    const key =
      typeof issue.remoteKey === "string" ? issue.remoteKey : null;
    const title =
      typeof issue.title === "string" ? issue.title : "Tracker issue filed";
    const runId = typeof result.runId === "string" ? result.runId : null;
    const resultId = typeof result.id === "string" ? result.id : null;
    return {
      event,
      title: key ? `Issue created: ${key}` : "Issue created",
      body: title,
      href: runId
        ? `${base}/runs/${runId}${resultId ? `?result=${resultId}` : ""}`
        : `${base}/triage`,
      data,
    };
  }
  const dims = Array.isArray(data.dimensions) ? data.dimensions : [];
  return {
    event,
    title: "Coverage dropped",
    body:
      dims.length > 0
        ? dims
            .map((d) => {
              const row = d as Record<string, unknown>;
              return `${String(row.key ?? "?")}: ${String(row.beforePct ?? "?")}% → ${String(row.afterPct ?? "?")}%`;
            })
            .join("; ")
        : "One or more coverage dimensions decreased",
    href: `${base}/reports`,
    data,
  };
}

function slackPayload(message: NotificationChannelMessage) {
  const lines = [message.title];
  if (message.body) lines.push(message.body);
  if (message.href) lines.push(message.href);
  return { text: lines.join("\n") };
}

function teamsPayload(message: NotificationChannelMessage) {
  const facts: Array<{ name: string; value: string }> = [
    { name: "Event", value: message.event },
  ];
  if (message.body) facts.push({ name: "Detail", value: message.body });
  if (message.href) facts.push({ name: "Link", value: message.href });
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: message.title,
    themeColor: "2D6A4F",
    title: message.title,
    sections: [{ facts }],
  };
}

async function postIncomingWebhook(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number | null; error?: string }> {
  const destination = await assertSafeWebhookDestination(url);
  if (!destination.ok) {
    return { ok: false, status: null, error: destination.error };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Topology-Notifications/1.0",
      },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    await response.body?.cancel();
    return { ok: response.ok, status: response.status };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "Delivery failed",
    };
  }
}

export type EnvSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

/** Workspace invite / fallback SMTP from env (optional). */
export function readEnvSmtpConfig(): EnvSmtpConfig | null {
  const host = process.env.TOPOLOGY_SMTP_HOST?.trim();
  const from =
    process.env.TOPOLOGY_SMTP_FROM?.trim() ||
    process.env.TOPOLOGY_SMTP_USER?.trim();
  if (!host || !from) return null;
  const port = Number(process.env.TOPOLOGY_SMTP_PORT ?? "587");
  const secure =
    process.env.TOPOLOGY_SMTP_SECURE === "1" ||
    process.env.TOPOLOGY_SMTP_SECURE === "true" ||
    port === 465;
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    user: process.env.TOPOLOGY_SMTP_USER?.trim() || undefined,
    pass: process.env.TOPOLOGY_SMTP_PASS ?? undefined,
    from,
  };
}

export function isEnvSmtpConfigured(): boolean {
  return readEnvSmtpConfig() != null;
}

function smtpEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function quoteSmtpAddress(address: string) {
  return `<${address.replace(/[<>\r\n]/g, "")}>`;
}

type SmtpSocket = {
  write: (chunk: string) => boolean;
  end: () => void;
  destroy: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  setEncoding: (encoding: BufferEncoding) => void;
};

async function readSmtpReply(
  socket: SmtpSocket,
  buffer: { value: string },
): Promise<{ code: number; lines: string[] }> {
  for (;;) {
    if (!buffer.value.includes("\r\n")) {
      await new Promise<void>((resolve, reject) => {
        const onData = () => {
          if (buffer.value.includes("\r\n")) {
            cleanup();
            resolve();
          }
        };
        const onError = (err: unknown) => {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        };
        const onClose = () => {
          cleanup();
          reject(new Error("SMTP connection closed"));
        };
        const cleanup = () => {
          socket.off("data", onData);
          socket.off("error", onError);
          socket.off("close", onClose);
        };
        socket.on("data", onData);
        socket.on("error", onError);
        socket.on("close", onClose);
        // Data may have landed between the empty check and listener attach.
        onData();
      });
      continue;
    }

    const lines: string[] = [];
    while (buffer.value.includes("\r\n")) {
      const end = buffer.value.indexOf("\r\n");
      const line = buffer.value.slice(0, end);
      buffer.value = buffer.value.slice(end + 2);
      lines.push(line);
      if (/^\d{3} /.test(line)) break;
      if (!/^\d{3}-/.test(line)) break;
    }
    if (lines.length === 0) continue;
    const last = lines[lines.length - 1]!;
    const code = Number(last.slice(0, 3));
    if (!Number.isInteger(code)) {
      throw new Error(`Invalid SMTP reply: ${last}`);
    }
    return { code, lines };
  }
}

function attachSmtpBuffer(socket: SmtpSocket, buffer: { value: string }) {
  socket.setEncoding("utf8");
  socket.on("data", ((chunk: unknown) => {
    buffer.value += String(chunk);
  }) as (...args: unknown[]) => void);
}

async function openSmtpSocket(
  config: EnvSmtpConfig,
  buffer: { value: string },
): Promise<SmtpSocket> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    if (config.secure) {
      const socket = tlsConnect({
        host: config.host,
        port: config.port,
        servername: config.host,
        timeout: 12_000,
      });
      const typed = socket as unknown as SmtpSocket;
      attachSmtpBuffer(typed, buffer);
      socket.once("error", onError);
      socket.once("secureConnect", () => {
        socket.off("error", onError);
        resolve(typed);
      });
      return;
    }
    const socket = createConnection({
      host: config.host,
      port: config.port,
      timeout: 12_000,
    });
    const typed = socket as unknown as SmtpSocket;
    attachSmtpBuffer(typed, buffer);
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve(typed);
    });
  });
}

async function upgradeToTls(
  socket: SmtpSocket,
  host: string,
  buffer: { value: string },
): Promise<SmtpSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tlsConnect({
      socket: socket as unknown as import("node:net").Socket,
      servername: host,
      timeout: 12_000,
    });
    const typed = tlsSocket as unknown as SmtpSocket;
    buffer.value = "";
    attachSmtpBuffer(typed, buffer);
    tlsSocket.once("error", reject);
    tlsSocket.once("secureConnect", () => {
      resolve(typed);
    });
  });
}

/**
 * Minimal SMTP client (AUTH LOGIN + STARTTLS). Avoids a nodemailer dependency
 * when node_modules may be incomplete.
 */
export async function sendSmtpMail(input: {
  config: EnvSmtpConfig;
  to: string | string[];
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((v) => v.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, error: "No SMTP recipients" };
  }

  let socket: SmtpSocket | null = null;
  const buffer = { value: "" };
  try {
    socket = await openSmtpSocket(input.config, buffer);

    const expect = async (allowed: number[]) => {
      const reply = await readSmtpReply(socket!, buffer);
      if (!allowed.includes(reply.code)) {
        throw new Error(`SMTP ${reply.code}: ${reply.lines.join(" / ")}`);
      }
      return reply;
    };
    const send = async (command: string) => {
      socket!.write(`${command}\r\n`);
    };

    await expect([220]);
    await send(`EHLO topology.local`);
    let ehlo = await expect([250]);

    if (!input.config.secure && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
      await send("STARTTLS");
      await expect([220]);
      socket = await upgradeToTls(socket, input.config.host, buffer);
      await send(`EHLO topology.local`);
      ehlo = await expect([250]);
    }

    if (input.config.user && input.config.pass) {
      if (!ehlo.lines.some((l) => /AUTH/i.test(l))) {
        throw new Error("SMTP server does not advertise AUTH");
      }
      await send("AUTH LOGIN");
      await expect([334]);
      await send(smtpEncode(input.config.user));
      await expect([334]);
      await send(smtpEncode(input.config.pass));
      await expect([235]);
    }

    await send(`MAIL FROM:${quoteSmtpAddress(input.config.from)}`);
    await expect([250]);
    for (const to of recipients) {
      await send(`RCPT TO:${quoteSmtpAddress(to)}`);
      await expect([250, 251]);
    }
    await send("DATA");
    await expect([354]);
    const headers = [
      `From: ${input.config.from}`,
      `To: ${recipients.join(", ")}`,
      `Subject: ${input.subject.replace(/[\r\n]+/g, " ")}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      input.text.replace(/^\./gm, ".."),
      ".",
    ].join("\r\n");
    socket.write(`${headers}\r\n`);
    await expect([250]);
    await send("QUIT");
    try {
      await expect([221]);
    } catch {
      // Some servers close immediately after QUIT.
    }
    socket.end();
    return { ok: true };
  } catch (err) {
    socket?.destroy();
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SMTP send failed",
    };
  }
}

export async function sendWorkspaceInviteEmail(input: {
  to: string;
  workspaceName: string;
  acceptUrl: string;
  inviterEmail?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const config = readEnvSmtpConfig();
  if (!config) return { sent: false };
  const inviter = input.inviterEmail ? ` by ${input.inviterEmail}` : "";
  const result = await sendSmtpMail({
    config,
    to: input.to,
    subject: `Join ${input.workspaceName} on Topology`,
    text: [
      `You were invited${inviter} to join ${input.workspaceName} on Topology.`,
      "",
      `Accept the invite:`,
      input.acceptUrl,
      "",
      "If you were not expecting this email, you can ignore it.",
    ].join("\n"),
  });
  return result.ok
    ? { sent: true }
    : { sent: false, error: result.error };
}

function smtpConfigFromChannel(
  config: Record<string, unknown>,
): EnvSmtpConfig | null {
  const host = typeof config.host === "string" ? config.host.trim() : "";
  const from = typeof config.from === "string" ? config.from.trim() : "";
  if (!host || !from) return null;
  const portRaw = config.port;
  const port =
    typeof portRaw === "number"
      ? portRaw
      : typeof portRaw === "string"
        ? Number(portRaw)
        : 587;
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure: Boolean(config.secure) || port === 465,
    user: typeof config.user === "string" ? config.user : undefined,
    pass: typeof config.pass === "string" ? config.pass : undefined,
    from,
  };
}

async function deliverToChannel(
  channel: NotificationChannel,
  message: NotificationChannelMessage,
  recipientEmails: string[],
): Promise<{ ok: boolean; error?: string }> {
  const config = parseChannelConfigJson(channel.configJson);
  if (channel.kind === "slack") {
    const url = typeof config.url === "string" ? config.url : "";
    const result = await postIncomingWebhook(url, slackPayload(message));
    return { ok: result.ok, error: result.error };
  }
  if (channel.kind === "teams") {
    const url = typeof config.url === "string" ? config.url : "";
    const result = await postIncomingWebhook(url, teamsPayload(message));
    return { ok: result.ok, error: result.error };
  }

  const smtp = smtpConfigFromChannel(config);
  if (!smtp) return { ok: false, error: "SMTP channel is missing host/from" };
  const configuredTo =
    typeof config.to === "string"
      ? config.to
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
  const to =
    message.event === "assignment" || message.event === "mention"
      ? recipientEmails.length > 0
        ? recipientEmails
        : configuredTo
      : configuredTo.length > 0
        ? configuredTo
        : recipientEmails;
  if (to.length === 0) {
    return { ok: false, error: "SMTP channel has no recipients" };
  }
  const lines = [message.title];
  if (message.body) lines.push("", message.body);
  if (message.href) lines.push("", message.href);
  const result = await sendSmtpMail({
    config: smtp,
    to,
    subject: `[Topology] ${message.title}`,
    text: lines.join("\n"),
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function resolveRecipientEmails(
  data: Record<string, unknown>,
): Promise<string[]> {
  if (typeof data.recipientEmail === "string" && data.recipientEmail.trim()) {
    return [data.recipientEmail.trim().toLowerCase()];
  }
  if (typeof data.userId === "string") {
    const user = await db.query.users.findFirst({
      where: eq(users.id, data.userId),
      columns: { email: true },
    });
    if (user?.email) return [user.email.toLowerCase()];
  }
  return [];
}

/**
 * Fire-and-forget dispatch to enabled Slack/Teams/SMTP channels subscribed to `event`.
 */
export async function dispatchNotificationChannels(
  event: NotificationChannelEvent,
  data: Record<string, unknown>,
  workspaceId: string,
): Promise<NotificationChannelMessage> {
  const message = formatChannelMessage(event, data);
  const channels = await db.query.notificationChannels.findMany({
    where: and(
      eq(notificationChannels.workspaceId, workspaceId),
      eq(notificationChannels.enabled, 1),
    ),
  });
  const recipients = await resolveRecipientEmails(data);
  const deliveries: Promise<unknown>[] = [];
  for (const channel of channels) {
    if (!parseEvents(channel.events).has(event)) continue;
    deliveries.push(deliverToChannel(channel, message, recipients));
  }
  void Promise.allSettled(deliveries);
  return message;
}

/** Deliver a test message to a single channel (awaits result). */
export async function sendNotificationChannelTest(
  channel: NotificationChannel,
): Promise<{ ok: boolean; error?: string }> {
  const message = formatChannelMessage("run.completed", {
    run: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Notification channel test",
      status: "completed",
    },
    summary: { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, untested: 0 },
    test: true,
  });
  const recipients =
    channel.kind === "smtp"
      ? (() => {
          const config = parseChannelConfigJson(channel.configJson);
          return typeof config.to === "string"
            ? config.to
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : [];
        })()
      : [];
  return deliverToChannel(channel, message, recipients);
}
