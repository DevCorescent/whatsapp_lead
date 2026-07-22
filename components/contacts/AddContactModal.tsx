"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { createContactSchema, type CreateContactInput } from "@/lib/validators/contact";
import { cn } from "@/lib/utils";
import { useContactSources, useCreateContact } from "@/hooks/useContacts";

const EMPTY: CreateContactInput = {
  name: "",
  phone: "",
  email: "",
  company: "",
  designation: "",
  location: "",
  source: "",
  notes: "",
};

/**
 * Unmounting the form while the modal is closed is what keeps a re-opened modal
 * from showing the previous attempt's values and error banner — the alternative,
 * resetting from an effect on `open`, trips react-hooks/set-state-in-effect.
 */
export function AddContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <AddContactForm onClose={onClose} />;
}

function AddContactForm({ onClose }: { onClose: () => void }) {
  const createContact = useCreateContact();
  const { data: sources = [] } = useContactSources();
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
    defaultValues: EMPTY,
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      await createContact.mutateAsync(values);
      onClose();
    } catch (error) {
      setBanner((error as Error).message || "Could not save contact. Please try again.");
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Contact"
      description="Create a new contact in your workspace."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {banner && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{banner}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={errors.name?.message}>
            <input
              id="name"
              className={inputClass}
              placeholder="Priya Sharma"
              {...register("name")}
            />
          </Field>

          <Field label="Phone" htmlFor="phone" required error={errors.phone?.message}>
            <input
              id="phone"
              className={inputClass}
              placeholder="+919876543210"
              inputMode="tel"
              {...register("phone")}
            />
          </Field>

          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <input
              id="email"
              type="email"
              className={inputClass}
              placeholder="priya@acme.in"
              {...register("email")}
            />
          </Field>

          <Field label="Company" htmlFor="company" error={errors.company?.message}>
            <input
              id="company"
              className={inputClass}
              placeholder="Acme Pvt Ltd"
              {...register("company")}
            />
          </Field>

          <Field label="Designation" htmlFor="designation" error={errors.designation?.message}>
            <input
              id="designation"
              className={inputClass}
              placeholder="Head of Sales"
              {...register("designation")}
            />
          </Field>

          <Field label="Location" htmlFor="location" error={errors.location?.message}>
            <input
              id="location"
              className={inputClass}
              placeholder="Bengaluru, IN"
              {...register("location")}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Source" htmlFor="source" error={errors.source?.message}>
              <input
                id="source"
                className={inputClass}
                list="contact-source-options"
                autoComplete="off"
                placeholder="Website, Referral, Expo 2026, or your own label…"
                {...register("source", {
                  setValueAs: (value: string) => value?.trim() ?? "",
                })}
              />
              {sources.length > 0 && (
                <datalist id="contact-source-options">
                  {sources.map((source) => (
                    <option key={source} value={source} />
                  ))}
                </datalist>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Any custom source is allowed. Existing values from your contacts appear here automatically.
              </p>
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
              <textarea
                id="notes"
                rows={3}
                className={cn(inputClass, "resize-y")}
                placeholder="Anything worth remembering about this contact…"
                {...register("notes")}
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || createContact.isPending}>
            {isSubmitting || createContact.isPending ? "Saving…" : "Save Contact"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
