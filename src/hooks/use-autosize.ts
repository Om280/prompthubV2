"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Grows a textarea to fit its content (optionally capped at `maxRows`). */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxRows?: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      let h = el.scrollHeight;
      if (maxRows) {
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || 24;
        const cap = lh * maxRows + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        el.style.overflowY = h > cap + 1 ? "auto" : "hidden";
        h = Math.min(h, cap);
      }
      el.style.height = `${h}px`;
    };
    fit();
    let width = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth !== width) {
        width = el.offsetWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, value, maxRows]);
}
