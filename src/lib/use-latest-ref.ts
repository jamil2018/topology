"use client";

import { useLayoutEffect, useRef } from "react";

/** Keep a ref aligned with the latest value without writing during render. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
