"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { postJson } from "@/components/knowledge/api";
import { SETS_KEY, type FaqSet, type FaqSetDoc } from "@/components/knowledge/faqSets";

export function CreateSetModal({
  open,
  documents,
  onClose,
  onCreated,
}: {
  open: boolean;
  documents: FaqSetDoc[];
  onClose: () => void;
  onCreated?: (set: FaqSet) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (body: { name: string; docIds: string[] }) => {
      const json = await postJson<FaqSet>("/api/knowledge/faq-sets", body);
      return json.data as FaqSet;
    },
    onSuccess: (set) => {
      queryClient.invalidateQueries({ queryKey: SETS_KEY });
      setName("");
      setPicked([]);
      onCreated?.(set);
      onClose();
    },
  });

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  return (
    <Modal
      open={open}
      onClose={() => { if (!create.isPending) onClose(); }}
      title="New combined FAQ set"
      description="Pick the documents these questions should draw on."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name: name.trim(), docIds: picked });
        }}
        className="space-y-4"
      >
        <Field label="Name" htmlFor="set-name" required>
          <input
            id="set-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Warranty & claims"
            className={inputClass}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Documents</p>
          <div className="scrollbar-slim max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {documents.map((doc) => (
              <label
                key={doc.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(doc.id)}
                  onChange={() => toggle(doc.id)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0B6E4F] focus:ring-emerald-200"
                />
                <span className="truncate">{doc.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {/* Stated as a rule rather than enforced silently by a disabled button
                with no explanation. One document is what a document's own FAQ
                list already covers. */}
            Pick at least two — a set over one document is that document&rsquo;s own FAQ list.
          </p>
        </div>

        {create.isError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {(create.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || picked.length < 2 || !name.trim()}>
            {create.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              "Create set"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
