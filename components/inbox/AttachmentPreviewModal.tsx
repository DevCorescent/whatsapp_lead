"use client";

import { useEffect, useRef } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Loader2,
  Music,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Button, Modal, inputClass } from "@/components/ui";
import { fileExtension, formatBytes } from "@/lib/attachments";
import { cn } from "@/lib/utils";
import type { PendingAttachment } from "./useAttachmentComposer";

/** Pick the card icon for a document by its extension; everything else has its own preview. */
function documentIcon(name: string) {
  const ext = fileExtension(name);
  if (["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (["zip", "rar"].includes(ext)) return FileArchive;
  return FileText;
}

function AttachmentCard({
  item,
  index,
  count,
  disabled,
  onRemove,
  onMove,
}: {
  item: PendingAttachment;
  index: number;
  count: number;
  disabled: boolean;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const ext = fileExtension(item.file.name);
  const isPdf = ext === "pdf";

  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
      {/* Preview */}
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
        {item.category === "IMAGE" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
        ) : item.category === "VIDEO" ? (
          <video src={item.previewUrl} className="h-full w-full object-cover" muted playsInline />
        ) : item.category === "AUDIO" ? (
          <Music className="h-6 w-6 text-slate-400" />
        ) : isPdf ? (
          // A PDF object URL renders its first page in most browsers; the icon shows through if not.
          <object data={item.previewUrl} type="application/pdf" className="h-full w-full" aria-label={item.file.name}>
            <FileText className="h-6 w-6 text-slate-400" />
          </object>
        ) : (
          (() => {
            const Icon = documentIcon(item.file.name);
            return <Icon className="h-6 w-6 text-slate-400" />;
          })()
        )}
      </div>

      {/* Meta + inline players */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatBytes(item.file.size)}
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="uppercase">{ext || item.category.toLowerCase()}</span>
          {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
        </p>
        {item.category === "AUDIO" && (
          <audio src={item.previewUrl} controls className="mt-1.5 h-8 w-full max-w-xs" />
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {count > 1 && (
          <div className="flex flex-col">
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => onMove(item.id, -1)}
              aria-label={`Move ${item.file.name} earlier`}
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || index === count - 1}
              onClick={() => onMove(item.id, 1)}
              aria-label={`Move ${item.file.name} later`}
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.file.name}`}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/**
 * The review step between selecting attachments and sending them.
 *
 * Files are shown with a type-appropriate preview (image thumbnail, playable video/audio, PDF
 * first page, document icon) and can be removed, reordered or captioned before anything is
 * uploaded. Pressing Send hands control back to the composer's upload → send pipeline; a failed
 * upload keeps this open with the files intact so the agent can retry. Chrome, ESC-to-close, focus
 * trapping and scroll-locking are inherited from the shared `Modal`.
 */
export function AttachmentPreviewModal({
  items,
  caption,
  onCaptionChange,
  isNote,
  isUploading,
  progress,
  uploadError,
  errors,
  onRemove,
  onMove,
  onCancelUpload,
  onDiscard,
  onSend,
}: {
  items: PendingAttachment[];
  caption: string;
  onCaptionChange: (value: string) => void;
  isNote: boolean;
  isUploading: boolean;
  progress: number;
  uploadError: string | null;
  errors: string[];
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onCancelUpload: () => void;
  onDiscard: () => void;
  onSend: () => void;
}) {
  const captionRef = useRef<HTMLInputElement>(null);
  const open = items.length > 0;

  useEffect(() => {
    if (open) captionRef.current?.focus();
  }, [open]);

  // Closing means "cancel this upload" while it is running, and "discard the selection"
  // otherwise — so a mid-flight ESC never abandons files the agent may still want to send.
  const handleClose = () => {
    if (isUploading) onCancelUpload();
    else onDiscard();
  };

  const title = items.length === 1 ? "Send attachment" : `Send ${items.length} attachments`;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      description={isNote ? "Attached to an internal note — not sent to WhatsApp." : undefined}
      className="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {(errors.length > 0 || uploadError) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-0.5">
              {uploadError && <p className="font-medium">{uploadError}</p>}
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          </div>
        )}

        <ul className="scrollbar-slim max-h-[45vh] space-y-2 overflow-y-auto">
          {items.map((item, index) => (
            <AttachmentCard
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              disabled={isUploading}
              onRemove={onRemove}
              onMove={onMove}
            />
          ))}
        </ul>

        <div>
          <label htmlFor="attachment-caption" className="sr-only">
            Caption
          </label>
          <input
            id="attachment-caption"
            ref={captionRef}
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isUploading) {
                e.preventDefault();
                onSend();
              }
            }}
            disabled={isUploading}
            placeholder="Add a caption…"
            className={inputClass}
          />
        </div>

        {isUploading && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>Uploading…</span>
              <span className="nums">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {isUploading ? (
            <Button type="button" variant="secondary" onClick={onCancelUpload}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
          )}
          <Button
            type="button"
            onClick={onSend}
            disabled={isUploading || items.length === 0}
            className={cn(isNote && "bg-amber-500 hover:bg-amber-600")}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : uploadError ? (
              <>
                <Send className="h-4 w-4" />
                Retry
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
