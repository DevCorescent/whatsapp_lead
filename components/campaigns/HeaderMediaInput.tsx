"use client";

import { useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export type MediaHeaderType = "IMAGE" | "VIDEO" | "DOCUMENT";

export interface HeaderMediaValue {
  /** Meta media id from /api/campaigns/upload-media. Preferred over `mediaUrl`. */
  mediaId: string;
  /** Public URL, used when the user chose to link rather than upload. */
  mediaUrl: string;
}

/**
 * The image / video / document a media-header template needs at send time.
 *
 * Either uploads the file straight to Meta (yielding a media id) or takes a public
 * URL. Shared by the Create Campaign modal and the Bulk Broadcast page. Give it a
 * `key` of the template id so switching templates starts it over.
 */
export function HeaderMediaInput({
  headerType,
  value,
  onChange,
  onError,
}: {
  headerType: MediaHeaderType;
  value: HeaderMediaValue;
  onChange: (value: HeaderMediaValue) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState("");

  async function upload(file: File) {
    setUploadState("uploading");
    setFileName(file.name);
    onChange({ mediaId: "", mediaUrl: "" });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/campaigns/upload-media", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Upload failed");
      onChange({ mediaId: (json.data as { mediaId: string }).mediaId, mediaUrl: "" });
      setUploadState("done");
    } catch (err) {
      setUploadState("error");
      onError(err instanceof Error ? err.message : "File upload failed");
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">
        {headerType === "IMAGE" ? "Image" : headerType === "VIDEO" ? "Video" : "Document"}{" "}
        <span className="text-rose-500">*</span>
      </p>

      {/* Upload / URL toggle */}
      <div className="mb-3 flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {(["upload", "url"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setUploadState("idle");
              setFileName("");
              onChange({ mediaId: "", mediaUrl: "" });
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
              mode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {m === "upload" ? "📎 Upload file" : "🔗 Enter URL"}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <div>
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
              uploadState === "done"
                ? "border-emerald-300 bg-emerald-50"
                : uploadState === "error"
                  ? "border-rose-300 bg-rose-50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100",
            )}
          >
            {uploadState === "uploading" ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span className="text-xs text-slate-500">Uploading to Meta…</span>
              </>
            ) : uploadState === "done" ? (
              <>
                <span className="text-2xl">✅</span>
                <span className="max-w-full break-all text-xs font-medium text-emerald-700">{fileName}</span>
                <span className="text-[11px] text-emerald-600">Uploaded — click to replace</span>
              </>
            ) : uploadState === "error" ? (
              <>
                <span className="text-2xl">❌</span>
                <span className="text-xs text-rose-600">Upload failed — click to retry</span>
              </>
            ) : (
              <>
                <span className="text-2xl">
                  {headerType === "IMAGE" ? "🖼️" : headerType === "VIDEO" ? "🎬" : "📄"}
                </span>
                <span className="text-xs text-slate-600">
                  Click to select{" "}
                  {headerType === "IMAGE"
                    ? "an image (JPEG, PNG, WebP — max 5 MB)"
                    : headerType === "VIDEO"
                      ? "a video (MP4, 3GPP — max 16 MB)"
                      : "a document (PDF, Word, Excel — max 16 MB)"}
                </span>
              </>
            )}
            <input
              type="file"
              className="sr-only"
              accept={
                headerType === "IMAGE"
                  ? "image/jpeg,image/png,image/webp"
                  : headerType === "VIDEO"
                    ? "video/mp4,video/3gpp"
                    : "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              }
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
            <Info className="h-3 w-3 shrink-0" />
            File is uploaded directly to Meta and sent to every recipient.
          </p>
        </div>
      ) : (
        <div>
          <input
            type="url"
            value={value.mediaUrl}
            onChange={(e) => onChange({ mediaId: "", mediaUrl: e.target.value })}
            className={inputClass}
            placeholder="https://example.com/banner.jpg"
          />
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
            <Info className="h-3 w-3 shrink-0" />
            Must be a publicly accessible URL — no login or redirect.
          </p>
        </div>
      )}
    </div>
  );
}
