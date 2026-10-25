import { useEffect, useState } from "react";

export const RUN_CASE_ROW_HEIGHT = 56;

export function useVirtualWindow({
  count,
  rowHeight = RUN_CASE_ROW_HEIGHT,
  overscan = 6,
}: {
  count: number;
  rowHeight?: number;
  overscan?: number;
}) {
  const [parent, setParent] = useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!parent) return;

    const updateHeight = () => setHeight(parent.clientHeight);
    updateHeight();

    const onScroll = () => setScrollTop(parent.scrollTop);
    parent.addEventListener("scroll", onScroll, { passive: true });

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateHeight);
    observer?.observe(parent);

    return () => {
      parent.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [parent]);

  const viewport =
    height > 0 ? height : Math.min(Math.max(count, 1), 16) * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewport / rowHeight) + overscan * 2;
  const end = Math.min(count, start + visible);

  return {
    setParent,
    parent,
    start,
    end,
    rowHeight,
    totalHeight: count * rowHeight,
    offsetY: start * rowHeight,
  };
}

export function scrollIndexIntoView(
  scroller: HTMLElement | null,
  index: number,
  rowHeight: number,
) {
  if (!scroller || index < 0) return;
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (top < scroller.scrollTop) {
    scroller.scrollTop = top;
  } else if (bottom > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = bottom - scroller.clientHeight;
  }
}
