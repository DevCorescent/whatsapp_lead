"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AttachmentCategory,
  type AttachmentSpec,
  MAX_ATTACHMENTS,
  validateFile,
} from "@/lib/attachments";
import { useUploadAttachments } from "@/hooks/useAttachments";
import type { InboxMessage } from "./ConversationList";

/** A file the agent has picked but not yet sent — the unit the preview renders. */
export interface PendingAttachment {
  /** Local id, distinct from any server id; also the object-URL owner. */
  id: string;
  file: File;
  spec: AttachmentSpec;
  category: AttachmentCategory;
  /** Object URL for instant preview. Revoked on removal / clear / unmount. */
  previewUrl: string;
  /** Measured lazily off the object URL; absent until (and unless) it resolves. */
  width?: number;
  height?: number;
  duration?: number;
}

let localSeq = 0;
function localId(prefix: string) {
  localSeq += 1;
  return `${prefix}-${Date.now()}-${localSeq}`;
}

/** Read intrinsic dimensions / duration off the object URL without blocking selection. */
function measure(item: PendingAttachment): Promise<Partial<PendingAttachment>> {
  return new Promise((resolve) => {
    if (item.category === "IMAGE") {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({});
      img.src = item.previewUrl;
      return;
    }
    if (item.category === "VIDEO" || item.category === "AUDIO") {
      const el = document.createElement(item.category === "VIDEO" ? "video" : "audio");
      el.preload = "metadata";
      el.onloadedmetadata = () =>
        resolve({
          duration: Number.isFinite(el.duration) ? el.duration : undefined,
          ...(item.category === "VIDEO"
            ? {
                width: (el as HTMLVideoElement).videoWidth || undefined,
                height: (el as HTMLVideoElement).videoHeight || undefined,
              }
            : {}),
        });
      el.onerror = () => resolve({});
      el.src = item.previewUrl;
      return;
    }
    resolve({});
  });
}

/**
 * All attachment state and behaviour for one conversation's composer, in one hook.
 *
 * The three entry points the design calls for — the attachment button, drag-and-drop and
 * clipboard paste — are just three ways to hand `File`s to `addFiles`; from there a single
 * validate → preview → upload → send pipeline runs, so none of them has its own logic. Files
 * are never uploaded on selection: they sit as previews until the agent presses Send, exactly
 * as WhatsApp Web behaves.
 */
export function useAttachmentComposer({
  conversationId,
  onSend,
}: {
  conversationId: string | null;
  onSend: (conversationId: string, message: InboxMessage) => void;
}) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [caption, setCaption] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const { upload, cancel, reset, progress, isUploading, error: uploadError } = useUploadAttachments();

  // Mirror `items` so unmount cleanup and `clear()` can revoke every live object URL
  // without listing `items` as a dependency (which would revoke-and-recreate on every change).
  const itemsRef = useRef<PendingAttachment[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  const addFiles = useCallback((incoming: File[] | FileList | null) => {
    const files = incoming ? Array.from(incoming) : [];
    if (files.length === 0) return;

    const accepted: PendingAttachment[] = [];
    const rejected: string[] = [];

    setItems((current) => {
      let remaining = MAX_ATTACHMENTS - current.length;
      for (const file of files) {
        if (remaining <= 0) {
          rejected.push(`You can attach up to ${MAX_ATTACHMENTS} files per message`);
          break;
        }
        const result = validateFile({ name: file.name, type: file.type, size: file.size });
        if (!result.ok || !result.spec) {
          rejected.push(result.error ?? `"${file.name}" is not supported`);
          continue;
        }
        accepted.push({
          id: localId("att"),
          file,
          spec: result.spec,
          category: result.spec.category,
          previewUrl: URL.createObjectURL(file),
        });
        remaining -= 1;
      }
      return accepted.length ? [...current, ...accepted] : current;
    });

    // De-duplicate repeated messages (e.g. the same unsupported type dropped twice).
    setErrors(rejected.length ? [...new Set(rejected)] : []);

    // Fill in dimensions/duration once the browser has decoded metadata.
    for (const item of accepted) {
      measure(item).then((extra) => {
        if (!Object.keys(extra).length) return;
        setItems((current) =>
          current.map((it) => (it.id === item.id ? { ...it, ...extra } : it))
        );
      });
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const target = current.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((it) => it.id !== id);
    });
  }, []);

  const moveItem = useCallback((id: string, direction: -1 | 1) => {
    setItems((current) => {
      const index = current.findIndex((it) => it.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }, []);

  const clear = useCallback(() => {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    setCaption("");
    setErrors([]);
    reset();
  }, [reset]);

  const clearErrors = useCallback(() => setErrors([]), []);

  // ── Drag & drop ────────────────────────────────────────────────────────────
  // A depth counter survives dragenter/dragleave firing for every child element, so
  // the overlay tracks the composer as a whole rather than flickering per child.
  const hasFiles = (e: React.DragEvent) => e.dataTransfer?.types?.includes("Files");

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  // ── Clipboard paste ──────────────────────────────────────────────────────────
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        // A paste carrying files (a screenshot, a copied image) is an attachment; let
        // an ordinary text paste fall through to the input untouched.
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = useCallback(
    async ({ isNote }: { isNote: boolean }): Promise<boolean> => {
      if (!conversationId || items.length === 0) return false;

      const ordered = items;
      let uploaded;
      try {
        uploaded = await upload(ordered.map((it) => it.file));
      } catch {
        // Upload failed or was cancelled — leave the preview and its files intact so the
        // agent can retry without re-selecting anything. `uploadError` carries the reason.
        return false;
      }

      const trimmedCaption = caption.trim();
      uploaded.forEach((media, index) => {
        const item = ordered[index];
        const message: InboxMessage = {
          id: localId("local"),
          type: item.spec.messageType,
          direction: "OUTBOUND",
          // WhatsApp attaches one caption to a multi-file send; carry it on the first.
          content: index === 0 && trimmedCaption ? trimmedCaption : null,
          mediaUrl: media.url,
          mediaMimeType: media.mimeType,
          mediaSize: media.size,
          metadata: {
            filename: media.filename,
            ...(item.width ? { width: item.width } : {}),
            ...(item.height ? { height: item.height } : {}),
            ...(item.duration ? { duration: item.duration } : {}),
          },
          status: "SENT",
          isNote,
          isAiGenerated: false,
          createdAt: new Date().toISOString(),
        };
        onSend(conversationId, message);
      });

      clear();
      return true;
    },
    [conversationId, items, caption, upload, onSend, clear]
  );

  return {
    items,
    caption,
    setCaption,
    errors,
    clearErrors,
    isDragging,
    dragHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
    onPaste,
    addFiles,
    removeItem,
    moveItem,
    clear,
    send,
    cancelUpload: cancel,
    isUploading,
    progress,
    uploadError,
    hasAttachments: items.length > 0,
  };
}
