"use client";

import { cn } from "@/lib/utils";

/**
 * Accessible switch. Rendered as a real <button role="switch"> so it is
 * keyboard-operable and announced correctly, unlike a styled checkbox.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  size = "md",
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Accessible name — required when the switch has no visible <label>. */
  label?: string;
  className?: string;
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const shift = size === "sm" ? (checked ? "translate-x-4" : "translate-x-0.5") : checked ? "translate-x-5" : "translate-x-0.5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        "disabled:cursor-not-allowed disabled:opacity-50",
        track,
        checked ? "bg-emerald-600" : "bg-slate-300",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block transform rounded-full bg-white shadow transition-transform",
          knob,
          shift,
        )}
      />
    </button>
  );
}
