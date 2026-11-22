"use client";

import { Surface } from "@heroui/react";
import { useEffect, useRef } from "react";

/** Non-modal details view: the collapsed case browser remains available. */
export function ResponsiveInspector({
  children,
  onClose,
  label,
  onContainer,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
  onContainer?: (element: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onContainer?.(ref.current);
    ref.current
      ?.querySelector<HTMLButtonElement>('[aria-label="Close case editor"]')
      ?.focus({ preventScroll: true });
    return () => onContainer?.(null);
  }, [onContainer, label]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <Surface
      ref={ref}
      role="dialog"
      aria-modal="false"
      tabIndex={-1}
      aria-label={label}
      className="topo-inspector"
    >
      {children}
    </Surface>
  );
}
