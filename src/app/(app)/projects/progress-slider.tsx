"use client";

import { useState } from "react";

/** Task Flow's progress slider: 0–100 in steps of 5, with the value shown beside it. */
export function ProgressSlider({ name = "progress", defaultValue }: { name?: string; defaultValue: number }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        name={name}
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-brand-600"
      />
      <span className="w-12 text-right text-sm font-semibold tabular-nums text-brand-700">{value}%</span>
    </div>
  );
}
