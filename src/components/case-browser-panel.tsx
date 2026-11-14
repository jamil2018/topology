"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { FolderIcon, ListChecksIcon, XIcon } from "@phosphor-icons/react";

/** Keeps the browser mounted while details occupy the workspace. */
export function CaseBrowserPanel({ kind, collapsed, open, onOpenChange, children }: {
  kind: "folders" | "cases";
  collapsed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = kind === "folders" ? "Folders" : "Test cases";
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!open && timer.current) clearTimeout(timer.current); }, [open]);
  useEffect(() => {
    if (!collapsed || !open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [collapsed, open, onOpenChange]);
  function dismiss() {
    trigger.current?.focus();
    onOpenChange(false);
  }
  return <div ref={root} className={`topo-case-browser topo-case-browser--${kind}`}
    onMouseEnter={() => { cancelClose(); if (collapsed) onOpenChange(true); }}
    onMouseLeave={() => {
      cancelClose();
      if (collapsed && !root.current?.contains(document.activeElement)) timer.current = setTimeout(() => onOpenChange(false), 200);
    }}
    onBlur={(event) => { if (collapsed && !event.currentTarget.contains(event.relatedTarget)) onOpenChange(false); }}
    onKeyDown={(event) => { if (collapsed && open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); } }}>
    {collapsed ? <button ref={trigger} type="button" className="topo-case-browser-trigger" aria-label={`Browse ${label.toLowerCase()}`} aria-expanded={open} aria-controls={id}
      onFocus={() => onOpenChange(true)} onClick={() => onOpenChange(true)}>
      {kind === "folders" ? <FolderIcon size={20} /> : <ListChecksIcon size={20} />}
      <span>{label}</span>
    </button> : null}
    <div id={id} hidden={collapsed && !open} className={collapsed ? "topo-case-browser-popup" : undefined} aria-label={collapsed ? label : undefined} role={collapsed ? "region" : undefined}>
      {collapsed ? <div className="flex items-center justify-between gap-3 pb-3"><h2 className="text-sm font-semibold">{label}</h2><button type="button" aria-label={`Close ${label.toLowerCase()} menu`} className="rounded p-2" onClick={dismiss}><XIcon size={18} /></button></div> : null}
      {children}
    </div>
  </div>;
}
