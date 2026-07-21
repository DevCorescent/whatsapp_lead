"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  NODE_META,
  cryptoId,
  type FlowNode,
  type FlowNodeData,
} from "@/lib/chatbot";
import { NODE_ICON } from "@/components/chatbot/nodeIcons";
import { Button, Field, inputClass, selectClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface AgentOption {
  id: string;
  name: string;
}

/**
 * Config panel for the selected node. Emits partial data patches (`onPatch`) that
 * the editor merges into the node; button add/remove keep stable ids so the edges
 * that reference them stay valid.
 */
export function NodeInspector({
  node,
  agents,
  onPatch,
  onDelete,
}: {
  node: FlowNode;
  agents: AgentOption[];
  onPatch: (patch: Partial<FlowNodeData>) => void;
  onDelete: () => void;
}) {
  const meta = NODE_META[node.type];
  const Icon = NODE_ICON[node.type];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", meta.accent)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{meta.label}</p>
          <p className="truncate text-xs text-slate-500">{meta.description}</p>
        </div>
      </div>

      <div className="scrollbar-slim flex-1 space-y-4 overflow-y-auto p-4">
        {node.type === "send_message" && (
          <Field label="Message text" htmlFor="ni-message">
            <textarea
              id="ni-message"
              rows={5}
              value={node.data.message ?? ""}
              onChange={(e) => onPatch({ message: e.target.value })}
              className={cn(inputClass, "resize-y")}
              placeholder="Hi {{name}}! Thanks for reaching out…"
            />
          </Field>
        )}

        {node.type === "ask_question" && (
          <>
            <Field label="Question" htmlFor="ni-question">
              <textarea
                id="ni-question"
                rows={4}
                value={node.data.question ?? ""}
                onChange={(e) => onPatch({ question: e.target.value })}
                className={cn(inputClass, "resize-y")}
                placeholder="What are you looking for today?"
              />
            </Field>
            <Field label="Save response as" htmlFor="ni-saveas">
              <input
                id="ni-saveas"
                value={node.data.saveAs ?? ""}
                onChange={(e) => onPatch({ saveAs: e.target.value })}
                className={inputClass}
                placeholder="intent"
              />
              <p className="mt-1.5 text-xs text-slate-500">Variable name to store the reply in.</p>
            </Field>
          </>
        )}

        {node.type === "keyword_condition" && (
          <Field label="Keywords" htmlFor="ni-keywords">
            <input
              id="ni-keywords"
              value={(node.data.keywords ?? []).join(", ")}
              onChange={(e) =>
                onPatch({
                  keywords: e.target.value
                    .split(",")
                    .map((k) => k.trim())
                    .filter(Boolean),
                })
              }
              className={inputClass}
              placeholder="yes, sure, ok"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              If the reply matches any keyword it follows the <strong>Matched</strong> branch,
              otherwise <strong>Else</strong>.
            </p>
          </Field>
        )}

        {node.type === "button_choice" && (
          <>
            <Field label="Prompt" htmlFor="ni-prompt">
              <textarea
                id="ni-prompt"
                rows={3}
                value={node.data.prompt ?? ""}
                onChange={(e) => onPatch({ prompt: e.target.value })}
                className={cn(inputClass, "resize-y")}
                placeholder="How can we help you today?"
              />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Buttons</p>
              <div className="space-y-2">
                {(node.data.buttons ?? []).map((b, i) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <input
                      value={b.label}
                      onChange={(e) => {
                        const buttons = [...(node.data.buttons ?? [])];
                        buttons[i] = { ...b, label: e.target.value };
                        onPatch({ buttons });
                      }}
                      className={inputClass}
                      placeholder={`Option ${i + 1}`}
                    />
                    <button
                      type="button"
                      aria-label="Remove button"
                      onClick={() =>
                        onPatch({
                          buttons: (node.data.buttons ?? []).filter((x) => x.id !== b.id),
                        })
                      }
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  onPatch({
                    buttons: [...(node.data.buttons ?? []), { id: cryptoId(), label: "" }],
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Add button
              </Button>
            </div>
          </>
        )}

        {node.type === "collect_input" && (
          <>
            <Field label="Variable name" htmlFor="ni-variable">
              <input
                id="ni-variable"
                value={node.data.variable ?? ""}
                onChange={(e) => onPatch({ variable: e.target.value })}
                className={inputClass}
                placeholder="email"
              />
            </Field>
            <Field label="Validation" htmlFor="ni-validation">
              <select
                id="ni-validation"
                value={node.data.validation ?? "text"}
                onChange={(e) =>
                  onPatch({ validation: e.target.value as FlowNodeData["validation"] })
                }
                className={selectClass}
              >
                <option value="text">Any text</option>
                <option value="email">Email</option>
                <option value="phone">Phone number</option>
                <option value="number">Number</option>
              </select>
            </Field>
          </>
        )}

        {node.type === "assign_agent" && (
          <>
            <Field label="Assign to agent" htmlFor="ni-agent">
              <select
                id="ni-agent"
                value={node.data.agentId ?? ""}
                onChange={(e) => onPatch({ agentId: e.target.value })}
                className={selectClass}
              >
                <option value="">Any available agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team / department" htmlFor="ni-team">
              <input
                id="ni-team"
                value={node.data.team ?? ""}
                onChange={(e) => onPatch({ team: e.target.value })}
                className={inputClass}
                placeholder="Sales"
              />
            </Field>
          </>
        )}

        {(node.type === "start" || node.type === "end") && (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-500 ring-1 ring-inset ring-slate-900/5">
            {meta.description} This node has no settings.
          </p>
        )}
      </div>

      {meta.deletable && (
        <div className="border-t border-slate-200 p-4">
          <Button variant="danger" className="w-full" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete node
          </Button>
        </div>
      )}
    </div>
  );
}
