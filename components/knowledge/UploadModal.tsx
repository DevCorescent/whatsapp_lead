"use client";

/**
 * Upload dialog for the knowledge base — files by drag-drop or picker, plus URLs.
 *
 * Lifted out of the page unchanged when FAQ editing moved to its own screen. The
 * page is a document list now, and a three-hundred-line modal was most of what
 * was left in it.
 */

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, Trash2, UploadCloud } from "lucide-react";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setFiles([]);
    setUrl("");
    setUrls([]);
    setDragging(false);
    setError(null);
    onClose();
  };

  const upload = useMutation({
    // Files go up as multipart (real bytes, extracted server-side); a URL goes up as JSON.
    mutationFn: async (payload: FormData | { name: string; type: string; url: string }) => {
      const res = await fetch(
        "/api/knowledge",
        payload instanceof FormData
          ? { method: "POST", body: payload }
          : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      return json;
    },
    onError: (err: Error) => setError(err.message),
  });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload Document"
      description="PDF, DOCX, images or TXT up to 10 MB — tables and scanned files supported. Or index a public web page."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            if (files.length > 0) {
              const fd = new FormData();
              for (const file of files) fd.append("files", file);
              await upload.mutateAsync(fd);
            }
            const allUrls = [...urls, ...(url.trim() ? [url.trim()] : [])];
            for (const u of allUrls) {
              const name = u.split("/").filter(Boolean).pop() ?? "Web page";
              await upload.mutateAsync({ name, type: "URL", url: u });
            }
            queryClient.invalidateQueries({ queryKey: ["knowledge"] });
            close();
          } catch {
            // error handled by onError
          }
        }}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
            dragging
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 bg-slate-50/60 hover:border-emerald-400 hover:bg-emerald-50/40",
          )}
        >
          <UploadCloud
            className={cn("h-8 w-8", dragging ? "text-emerald-600" : "text-slate-400")}
          />
          <p className="mt-2 text-sm font-medium text-slate-800">
            Drag files here or click to browse
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Accepts PDF, DOCX, images (PNG/JPG), TXT or a URL</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.tiff,.bmp"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-slate-700">{f.name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {urls.length > 0 && (
          <ul className="space-y-1.5">
            {urls.map((u, i) => (
              <li
                key={`${u}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-slate-700">{u}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${u}`}
                  onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-2 text-xs uppercase tracking-wide text-slate-400">or</span>
          </div>
        </div>

        <Field label="Add from URL" htmlFor="kb-url">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="kb-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={cn(inputClass, "pl-9")}
                placeholder="https://yoursite.com/faq"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!url.trim()}
              onClick={() => { setUrls((prev) => [...prev, url.trim()]); setUrl(""); }}
            >
              Add
            </Button>
          </div>
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={(files.length === 0 && urls.length === 0 && !url.trim()) || upload.isPending}>
            {upload.isPending ? "Uploading…" : "Upload & Index"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
