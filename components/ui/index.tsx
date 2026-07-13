"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn, initials, avatarColor } from "@/lib/utils";

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-20 w-20 text-2xl",
  };

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name ?? "avatar"}
        className={cn("shrink-0 rounded-full object-cover", sizes[size], className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        avatarColor(name),
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        "bg-slate-50 text-slate-600 ring-slate-500/15",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  const variants = {
    // A tinted shadow under the primary is what makes it read as raised rather
    // than as a flat green rectangle.
    primary:
      "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700 active:bg-emerald-800",
    secondary:
      "bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900",
    ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
    danger: "bg-rose-600 text-white shadow-sm shadow-rose-600/25 hover:bg-rose-700",
  };
  const sizes = {
    sm: "h-8 gap-1.5 px-2.5 text-xs",
    md: "h-9 gap-2 px-3.5 text-sm",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

/**
 * A hairline ring plus a soft shadow, rather than a full grey border. The border
 * version reads as a wireframe once a page has more than a few cards on it.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-100", className)} />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}
    >
      {Icon && (
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-900/5">
          <Icon className="h-5 w-5 text-slate-400" />
        </span>
      )}
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-slate-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5",
          "scrollbar-slim max-h-[90vh] overflow-y-auto",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

const controlBase =
  "w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 shadow-sm " +
  "ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 " +
  "disabled:bg-slate-50 disabled:text-slate-400";

export const inputClass = controlBase;

/** Selects need the extra right padding that makes room for the custom chevron. */
export const selectClass = cn(controlBase, "cursor-pointer");

// ─── Page header ──────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
