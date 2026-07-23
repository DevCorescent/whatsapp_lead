"use client";

import { Upload } from "lucide-react";
import { ATTACHMENT_SPECS } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/**
 * The "Drop files here" overlay shown while files are dragged over the composer.
 *
 * Rendered absolutely inside the composer container (which is `relative`), so it highlights
 * only the composer and never dims the rest of the page. `pointer-events-none` keeps it from
 * stealing the drop event from the container underneath — the parent owns the drag handlers.
 */
export function AttachmentDropOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute inset-1 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-500 bg-emerald-50/95 text-center transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
        <Upload className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-emerald-900">Drop files here</p>
      <p className="max-w-xs text-xs text-emerald-700">
        {ATTACHMENT_SPECS.map((s) => s.label).join(" · ")}
      </p>
    </div>
  );
}
