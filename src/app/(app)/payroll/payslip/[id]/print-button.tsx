"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary">
      Print or save as PDF
    </button>
  );
}
