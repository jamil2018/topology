"use client";
import { useEffect, useRef } from "react";

/** Non-modal details view: the collapsed case browser remains available. */
export function ResponsiveInspector({ children, onClose, label, onContainer }: { children: React.ReactNode; onClose: () => void; label: string; onContainer?: (element: HTMLDialogElement | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    onContainer?.(ref.current);
    ref.current?.querySelector<HTMLButtonElement>('[aria-label="Close case editor"]')?.focus({ preventScroll: true });
    return () => onContainer?.(null);
  }, [onContainer, label]);
  return <dialog ref={ref} open aria-label={label} className="topo-inspector" onCancel={(event) => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}
