"use client";

import { Disclosure } from "@heroui/react";
import type { ReactNode } from "react";

export type TopoDisclosureProps = {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
  bodyClassName?: string;
  /** Bordered panel chrome around the disclosure. */
  bordered?: boolean;
  /** Optional muted summary / badge rendered after the title. */
  summary?: ReactNode;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
  isDisabled?: boolean;
  /** Forwarded to the root for hash / scroll targets. */
  id?: string;
};

/**
 * HeroUI Disclosure with spacing rhythm and optional bordered card chrome.
 */
export function TopoDisclosure({
  title,
  children,
  className,
  triggerClassName,
  bodyClassName,
  bordered = false,
  summary,
  defaultExpanded,
  isExpanded,
  onExpandedChange,
  isDisabled,
  id,
}: TopoDisclosureProps) {
  return (
    <Disclosure
      id={id}
      className={
        bordered
          ? `rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3 ${className ?? ""}`.trim()
          : className
      }
      defaultExpanded={defaultExpanded}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      isDisabled={isDisabled}
    >
      <Disclosure.Heading>
        <Disclosure.Trigger
          className={
            triggerClassName ??
            "flex w-full cursor-pointer items-center gap-2 py-1 text-left text-sm font-medium text-[color:var(--topo-ink)]"
          }
        >
          <span className="min-w-0 flex-1">
            {title}
            {summary ? (
              <span className="font-normal text-[color:var(--topo-muted)]">
                {" "}
                {summary}
              </span>
            ) : null}
          </span>
          <Disclosure.Indicator className="shrink-0" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body
          className={bodyClassName ?? "space-y-3 pt-2"}
        >
          {children}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
