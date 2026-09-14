"use client";

import { useState, type FormEvent } from "react";
import { CircleCheck, Mail } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, Reveal } from "./primitives";

type Status = "idle" | "sending" | "done" | "error";

/**
 * Newsletter sign-up, above the footer. Posts to /api/newsletter; the wording is
 * the CMS "Newsletter" section.
 *
 * `website` is a honeypot: hidden from people and assistive tech, and filled in
 * only by bots that complete every input they find.
 */
export function Newsletter({ section }: { section: PublicSection<"newsletter"> }) {
  const { content } = section;
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setError("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Something went wrong. Please try again.");
      setStatus("done");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <section className="bg-white pb-14 sm:pb-16">
      <Container>
        <Reveal>
          <div className="flex flex-col gap-6 rounded-2xl bg-slate-50 p-6 ring-1 ring-inset ring-slate-900/5 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm shadow-emerald-600/25">
                <Mail className="h-5 w-5 text-white" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{content.title}</h2>
                {content.description && (
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">{content.description}</p>
                )}
              </div>
            </div>

            <div className="w-full lg:max-w-md">
              {status === "done" ? (
                <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                  <CircleCheck className="h-4 w-4 shrink-0" />
                  {content.successMessage || "Thanks for subscribing."}
                </p>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" noValidate={false}>
                  <label htmlFor="newsletter-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="newsletter-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={content.placeholder}
                    aria-invalid={status === "error" || undefined}
                    aria-describedby="newsletter-note"
                    className={cn(
                      "min-w-0 flex-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500",
                      status === "error" && "ring-rose-300",
                    )}
                  />
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    className="absolute -left-[9999px] h-px w-px opacity-0"
                  />
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:pointer-events-none disabled:opacity-60"
                  >
                    {status === "sending" ? "Subscribing…" : content.buttonLabel}
                  </button>
                </form>
              )}
              <p
                id="newsletter-note"
                aria-live="polite"
                className={cn("mt-2 text-xs", status === "error" ? "text-rose-600" : "text-slate-500")}
              >
                {status === "error" ? error : status === "done" ? "" : content.privacyNote}
              </p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
