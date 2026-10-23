"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "./icons";

/** A password box with an eye button to show what was typed, for checking it on a phone before signing in. */
export function PasswordInput({ className = "input", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={shown ? "text" : "password"} className={`${className} pr-10`} />
      <button
        type="button"
        className="password-eye"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
      >
        <Icon name={shown ? "eyeOff" : "eye"} className="h-4 w-4" />
      </button>
    </span>
  );
}
