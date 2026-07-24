"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Button, Card, Field, Modal, inputClass } from "@/components/ui";
import {
  useQuickReplies,
  useCreateQuickReply,
  useUpdateQuickReply,
  useDeleteQuickReply,
  type QuickReply,
} from "@/hooks/useQuickReplies";

/**
 * Quick replies manager — the canned responses agents expand in the inbox by typing "/shortcode".
 *
 * Deliberately not a working-copy editor like the pipeline stage manager: quick replies are
 * independent rows with no ordering or defaults between them, so each edit is its own request and
 * there is nothing to save atomically.
 */
export function QuickRepliesTab() {
  const { data, isLoading } = useQuickReplies();
  const create = useCreateQuickReply();
  const update = useUpdateQuickReply();
  const remove = useDeleteQuickReply();

  const quickReplies: QuickReply[] = data?.data ?? [];

  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [shortcode, setShortcode] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setIsNew(true);
    setEditing(null);
    setShortcode("");
    setContent("");
    setError(null);
  };

  const openEdit = (reply: QuickReply) => {
    setIsNew(false);
    setEditing(reply);
    setShortcode(reply.shortcode);
    setContent(reply.content);
    setError(null);
  };

  const close = () => {
    setIsNew(false);
    setEditing(null);
    setError(null);
  };

  const submit = () => {
    setError(null);
    const onError = (e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong");

    if (isNew) {
      create.mutate({ shortcode, content }, { onSuccess: close, onError });
    } else if (editing) {
      update.mutate({ id: editing.id, shortcode, content }, { onSuccess: close, onError });
    }
  };

  const saving = create.isPending || update.isPending;
  const open = isNew || editing !== null;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-72 rounded-xl bg-slate-100" />
      </div>
    );
  }

  return (
    <Card>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Quick Replies</h2>
          <p className="mt-1 text-sm text-slate-500">
            Saved responses your team can insert in the inbox by typing{" "}
            <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">/shortcode</span>.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>

      {quickReplies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
          <Zap className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">No quick replies yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add your most-used answers so agents never retype them.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {quickReplies.map((reply) => (
            <li key={reply.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-semibold text-emerald-700">/{reply.shortcode}</p>
                <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-sm text-slate-600">
                  {reply.content}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(reply)}
                  aria-label={`Edit /${reply.shortcode}`}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(reply.id)}
                  aria-label={`Delete /${reply.shortcode}`}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Modal
          open
          onClose={close}
          title={isNew ? "New quick reply" : "Edit quick reply"}
          description="Agents insert this in the inbox by typing the shortcode after a slash."
        >
          <div className="space-y-4">
            <Field label="Shortcode" htmlFor="qr-shortcode" required>
              <input
                id="qr-shortcode"
                className={inputClass}
                maxLength={32}
                value={shortcode}
                onChange={(e) => setShortcode(e.target.value)}
                placeholder="hours"
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-500">
                Letters, numbers, . _ and - only. Saved lower-case.
              </p>
            </Field>

            <Field label="Message" htmlFor="qr-content" required>
              <textarea
                id="qr-content"
                className={inputClass}
                rows={5}
                maxLength={4096}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="We're open Monday to Saturday, 9am – 7pm IST."
              />
            </Field>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving || !shortcode.trim() || !content.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
