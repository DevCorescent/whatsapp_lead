"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui";
import { NODE_KINDS, type NodeKind } from "@/lib/chatbot/types";
import { NODE_ICON } from "./nodeMeta";

export const DND_MIME = "application/x-flow-node";

/** Left palette — searchable, draggable node types. Dragging carries the kind via
 *  the dataTransfer; FlowBuilder's onDrop places a new node at the cursor. */
export function NodePalette({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NODE_KINDS.filter((m) => m.creatable).filter(
      (m) => !q || m.label.toLowerCase().includes(q) || m.hint.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60">
      <div className="border-b border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Node types</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search node types"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(inputClass, "h-8 pl-8 text-xs")}
          />
        </div>
      </div>

      <div className="scrollbar-slim flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No matching nodes</p>
        ) : (
          items.map((m) => {
            const Icon = NODE_ICON[m.kind];
            return (
              <button
                key={m.kind}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_MIME, m.kind);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDoubleClick={() => onAdd(m.kind)}
                title="Drag onto the canvas, or double-click to add"
                className="flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-emerald-300 hover:shadow active:cursor-grabbing"
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", m.chip)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{m.label}</span>
                  <span className="block truncate text-[11px] text-slate-400">{m.hint}</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <p className="border-t border-slate-200 p-3 text-[11px] leading-relaxed text-slate-500">
        Drag a node onto the canvas, then connect nodes by dragging between the dots on their edges.
      </p>
    </aside>
  );
}
