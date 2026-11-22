"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { Button } from "@heroui/react";
import { FolderIcon, ListChecksIcon, XIcon } from "@phosphor-icons/react";

/** Keeps the browser mounted while details occupy the workspace. */
export const CaseBrowserPanel = memo(function CaseBrowserPanel({
  kind,
  collapsed,
  open,
  onOpenChange,
  children,
}: {
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
  // advanced-event-handler-refs / no-ref-current-in-render
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  const label = kind === "folders" ? "Folders" : "Test cases";
  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open && timer.current) clearTimeout(timer.current);
  }, [open]);
  useEffect(() => {
    if (!collapsed || !open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        onOpenChangeRef.current(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [collapsed, open]);

  const dismiss = useCallback(() => {
    trigger.current?.focus();
    onOpenChangeRef.current(false);
  }, []);

  return (
    <div
      ref={root}
      className={`topo-case-browser topo-case-browser--${kind}${
        collapsed ? "" : " flex min-h-0 flex-col md:h-full"
      }`}
      onMouseEnter={() => {
        cancelClose();
        if (collapsed) onOpenChangeRef.current(true);
      }}
      onMouseLeave={() => {
        cancelClose();
        if (collapsed && !root.current?.contains(document.activeElement)) {
          timer.current = setTimeout(() => onOpenChangeRef.current(false), 200);
        }
      }}
      onBlur={(event) => {
        if (collapsed && !event.currentTarget.contains(event.relatedTarget)) {
          onOpenChangeRef.current(false);
        }
      }}
      onKeyDown={(event) => {
        if (collapsed && open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      {collapsed ? (
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          className="topo-case-browser-trigger"
          aria-label={`Browse ${label.toLowerCase()}`}
          aria-expanded={open}
          aria-controls={id}
          onFocus={() => onOpenChangeRef.current(true)}
          onPress={() => onOpenChangeRef.current(true)}
        >
          {kind === "folders" ? (
            <FolderIcon size={20} />
          ) : (
            <ListChecksIcon size={20} />
          )}
          <span>{label}</span>
        </Button>
      ) : null}
      <div
        id={id}
        hidden={collapsed && !open}
        className={
          collapsed
            ? "topo-case-browser-popup"
            : "flex min-h-0 flex-1 flex-col md:h-full"
        }
        aria-label={collapsed ? label : undefined}
        role={collapsed ? "region" : undefined}
      >
        {collapsed ? (
          <div className="flex items-center justify-between gap-3 pb-3">
            <h2 className="text-sm font-semibold">{label}</h2>
            <Button
              type="button"
              variant="ghost"
              isIconOnly
              aria-label={`Close ${label.toLowerCase()} menu`}
              className="rounded p-2"
              onPress={dismiss}
            >
              <XIcon size={18} />
            </Button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
});
