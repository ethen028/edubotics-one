"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SPOT = ".card, .stat";
// Money and counts like "₹9,15,000", "₹0.00" or "12"; anything else (times, "4 / 4") is left as it is.
const NUMBER = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/;

/** The Depth style's two moving touches: a glow that follows the pointer over cards, and number cards that
 *  count up when a page opens. Both skip themselves when the device asks for less motion. */
export function DepthEffects() {
  const pathname = usePathname();

  useEffect(() => {
    let frame = 0;
    let last: PointerEvent | null = null;
    const move = (e: PointerEvent) => {
      last = e;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = last && (last.target as Element).closest?.<HTMLElement>(SPOT);
        if (!el || !last) return;
        const box = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${last.clientX - box.left}px`);
        el.style.setProperty("--my", `${last.clientY - box.top}px`);
      });
    };
    const leave = (e: PointerEvent) => {
      const el = (e.target as Element).closest?.<HTMLElement>(SPOT);
      if (el && !el.contains(e.relatedTarget as Node)) {
        el.style.removeProperty("--mx");
        el.style.removeProperty("--my");
      }
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
    };
  }, []);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Changes the existing text node in place, so React still owns the same node afterwards.
    const runs: { node: Text; text: string }[] = [];
    let frame = 0;
    const start = performance.now();
    for (const el of document.querySelectorAll<HTMLElement>("main .stat-value")) {
      const node = el.firstChild;
      if (el.childNodes.length !== 1 || !(node instanceof Text)) continue;
      const text = node.nodeValue ?? "";
      const m = NUMBER.exec(text);
      if (!m || Number(m[2].replace(/,/g, "")) === 0) continue;
      runs.push({ node, text });
    }
    if (!runs.length) return;
    const step = (now: number) => {
      // Critically damped spring progress, settled after about 0.8s.
      const t = Math.min((now - start) / 800, 1);
      const w = t * 7.5;
      const p = t === 1 ? 1 : 1 - (1 + w) * Math.exp(-w);
      for (const { node, text } of runs) {
        const [, pre, num, post] = NUMBER.exec(text)!;
        const decimals = num.split(".")[1]?.length ?? 0;
        const value = Number(num.replace(/,/g, "")) * p;
        const shown = num.includes(",")
          ? value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
          : value.toFixed(decimals);
        node.nodeValue = t === 1 ? text : `${pre}${shown}${post}`;
      }
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      for (const { node, text } of runs) node.nodeValue = text;
    };
  }, [pathname]);

  return null;
}
