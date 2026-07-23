"use client";

import { useCallback, useRef, useState } from "react";

/** Authoritative metadata returned by POST /api/media/upload, one per stored file. */
export interface UploadedMedia {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  category: string;
}

interface UploadOptions {
  onProgress?: (percent: number) => void;
}

/**
 * Upload attachments through the shared `/api/media/upload` route with live progress.
 *
 * `fetch` cannot report upload progress, so this uses `XMLHttpRequest` — the one place a
 * raw XHR earns its keep. The request is held in a ref so `cancel()` can abort an in-flight
 * upload, and `upload()` rejects on abort/failure without discarding the caller's files, which
 * is what lets the preview stay open and offer a retry.
 *
 * A single hook instance uploads one batch at a time; the composer only ever has one preview
 * open, so it drives one instance.
 */
export function useUploadAttachments() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setIsUploading(false);
    setProgress(0);
  }, []);

  const reset = useCallback(() => {
    setProgress(0);
    setError(null);
    setIsUploading(false);
  }, []);

  const upload = useCallback(
    (files: File[], options?: UploadOptions): Promise<UploadedMedia[]> => {
      return new Promise<UploadedMedia[]>((resolve, reject) => {
        const form = new FormData();
        for (const file of files) form.append("files", file, file.name);

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        setError(null);
        setProgress(0);
        setIsUploading(true);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
          options?.onProgress?.(percent);
        };

        xhr.onload = () => {
          xhrRef.current = null;
          setIsUploading(false);

          let payload: { success?: boolean; data?: UploadedMedia[]; error?: string } = {};
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            /* fall through to the status-based error below */
          }

          if (xhr.status >= 200 && xhr.status < 300 && payload.success && payload.data) {
            setProgress(100);
            resolve(payload.data);
          } else {
            const message = payload.error ?? "Failed to upload attachments";
            setError(message);
            reject(new Error(message));
          }
        };

        xhr.onerror = () => {
          xhrRef.current = null;
          setIsUploading(false);
          const message = "Network error while uploading";
          setError(message);
          reject(new Error(message));
        };

        xhr.onabort = () => {
          xhrRef.current = null;
          setIsUploading(false);
          reject(new DOMException("Upload cancelled", "AbortError"));
        };

        xhr.open("POST", "/api/media/upload");
        xhr.send(form);
      });
    },
    []
  );

  return { upload, cancel, reset, progress, isUploading, error };
}
