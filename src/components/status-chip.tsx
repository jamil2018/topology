"use client";

import type { Icon, IconWeight } from "@phosphor-icons/react";
import {
  ArchiveIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleIcon,
  CircleNotchIcon,
  ClockIcon,
  EyeIcon,
  HeartbeatIcon,
  LightningIcon,
  MinusCircleIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  StopCircleIcon,
  WarningCircleIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useEffect } from "react";
import { motion, useAnimation, useReducedMotion } from "motion/react";

const toneClass = {
  neutral:
    "bg-[color:var(--topo-chip)] text-[color:var(--topo-muted)] border-[color:var(--topo-line)]",
  accent:
    "bg-[color-mix(in_srgb,var(--topo-accent)_78%,black)] text-white border-[color-mix(in_srgb,var(--topo-accent)_55%,black)] dark:bg-[color:var(--topo-accent)] dark:text-[color:var(--topo-paper)] dark:border-[color-mix(in_srgb,var(--topo-accent)_40%,white)]",
  success: "bg-emerald-700 text-white border-emerald-800",
  warning: "bg-amber-500 text-amber-950 border-amber-600",
  danger: "bg-red-700 text-white border-red-800",
  info: "bg-sky-700 text-white border-sky-800",
} as const;

const neutralStatusClass =
  "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)] border-[color:var(--topo-line)]";

export type StatusTone = keyof typeof toneClass;

type StatusMotion = "spin" | "enter";

type StatusVisual = {
  Icon: Icon;
  weight: IconWeight;
  motion: StatusMotion;
};

const statusVisual = {
  planned: { Icon: CircleDashedIcon, weight: "bold", motion: "enter" },
  draft: { Icon: PencilSimpleIcon, weight: "bold", motion: "enter" },
  untested: { Icon: CircleIcon, weight: "bold", motion: "enter" },
  in_progress: { Icon: CircleNotchIcon, weight: "bold", motion: "spin" },
  running: { Icon: CircleNotchIcon, weight: "bold", motion: "spin" },
  completed: { Icon: CheckCircleIcon, weight: "fill", motion: "enter" },
  passed: { Icon: CheckCircleIcon, weight: "fill", motion: "enter" },
  ready: { Icon: CheckCircleIcon, weight: "bold", motion: "enter" },
  healthy: { Icon: HeartbeatIcon, weight: "fill", motion: "enter" },
  go: { Icon: CheckCircleIcon, weight: "fill", motion: "enter" },
  resolved: { Icon: CheckCircleIcon, weight: "fill", motion: "enter" },
  active: { Icon: CircleIcon, weight: "fill", motion: "enter" },
  aborted: { Icon: StopCircleIcon, weight: "fill", motion: "enter" },
  failed: { Icon: XCircleIcon, weight: "fill", motion: "enter" },
  no_go: { Icon: XCircleIcon, weight: "fill", motion: "enter" },
  blocked: { Icon: ProhibitIcon, weight: "fill", motion: "enter" },
  critical: { Icon: WarningCircleIcon, weight: "fill", motion: "enter" },
  at_risk: { Icon: WarningIcon, weight: "fill", motion: "enter" },
  watch: { Icon: EyeIcon, weight: "bold", motion: "enter" },
  skipped: { Icon: MinusCircleIcon, weight: "fill", motion: "enter" },
  deprecated: { Icon: ArchiveIcon, weight: "fill", motion: "enter" },
  archived: { Icon: ArchiveIcon, weight: "fill", motion: "enter" },
  snoozed: { Icon: ClockIcon, weight: "bold", motion: "enter" },
  automation: { Icon: LightningIcon, weight: "fill", motion: "enter" },
  open: { Icon: CircleIcon, weight: "bold", motion: "enter" },
} as const satisfies Record<string, StatusVisual>;

const statusAliases: Record<string, keyof typeof statusVisual> = {
  pass: "passed",
  fail: "failed",
};

function chipLabel(children: React.ReactNode): string | null {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  return null;
}

function visualForLabel(label: string): StatusVisual | null {
  const key = label.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const resolved = statusAliases[key] ?? key;
  if (resolved in statusVisual) {
    return statusVisual[resolved as keyof typeof statusVisual];
  }
  return null;
}

function StatusGlyph({ visual }: { visual: StatusVisual }) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimation();
  const Icon = visual.Icon;

  // `useReducedMotion()` is null during SSR and a boolean after the client
  // reads `prefers-reduced-motion`. Branching `initial` on that value makes
  // the server emit the resting style while the client hydrates the entrance
  // style. Keep the first paint at rest, then animate only after mount.
  useEffect(() => {
    if (reduceMotion !== false) return;

    if (visual.motion === "spin") {
      void controls.start({
        rotate: 360,
        transition: { duration: 1.6, repeat: Infinity, ease: "linear" },
      });
      return;
    }

    void controls.start({
      opacity: [0, 1],
      scale: [0.75, 1],
      rotate: 0,
      transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
    });
  }, [controls, reduceMotion, visual.motion]);

  return (
    <motion.span
      aria-hidden
      className="inline-flex shrink-0"
      initial={false}
      animate={controls}
    >
      <Icon size={12} weight={visual.weight} />
    </motion.span>
  );
}

export function StatusChip({
  children,
  tone = "neutral",
  mono = false,
  title,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  mono?: boolean;
  title?: string;
}) {
  const label = chipLabel(children);
  const visual = label ? visualForLabel(label) : null;
  const toneClasses =
    visual && tone === "neutral" ? neutralStatusClass : toneClass[tone];

  return (
    <span
      title={title}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${toneClasses} ${
        mono ? "font-mono normal-case tracking-normal" : ""
      }`}
    >
      {visual ? <StatusGlyph visual={visual} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function statusToneForRun(status: string): StatusTone {
  switch (status) {
    case "completed":
    case "passed":
    case "ready":
    case "healthy":
    case "go":
      return "success";
    case "in_progress":
    case "running":
    case "watch":
    case "at_risk":
      return "warning";
    case "failed":
    case "blocked":
    case "aborted":
    case "critical":
    case "no_go":
      return "danger";
    case "automation":
      return "info";
    default:
      return "neutral";
  }
}
