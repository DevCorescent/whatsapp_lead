"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { updateContactSchema, type UpdateContactInput } from "@/lib/validators/contact";
import { useContactSources, useUpdateContact } from "@/hooks/useContacts";
import type { ContactRow } from "@/components/contacts/ContactTable";

/**
 * Edit an existing contact.
 *
 * Deliberately the same shape as AddContactModal — same validator family, same
 * fields, same source list — so the two forms cannot drift into disagreeing
 * about what a contact is.
 *
 * Mounted only while open, like the add modal: unmounting is what clears a
 * previous attempt's values and error banner without a setState-in-effect.
 *
 * The contact's id, tenant, business, tags, conversations and message history are
 * not part of this form. The id identifies the row in the URL, and ownership is
 * re-derived server-side from the session — a body carrying tenantId or businessId
 * would change nothing.
 */
export function EditContactModal({
  contact,
  onClose,
}: {
  contact: ContactRow | null;
  onClose: () => void;
}) {
  if (!contact) return null;
  return <EditContactForm contact={contact} onClose={onClose} />;
}

function EditContactForm({ contact, onClose }: { contact: ContactRow; onClose: () => void }) {
  const updateContact = useUpdateContact();
  const { data: sources = [] } = useContactSources();
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateContactInput>({
    resolver: zodResolver(updateContactSchema),
    // Prefilled from the row the operator clicked, so an edit starts from what
    // they can see rather than from an empty form.
    defaultValues: {
      name: contact.name ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      company: contact.company ?? "",
      designation: contact.designation ?? "",
      location: contact.location ?? "",
      source: contact.source ?? "",
      notes: contact.notes ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      await updateContact.mutateAsync({ id: contact.id, ...values });
      onClose();
    } catch (error) {
      // The server's message is the useful one here — a duplicate phone number
      // on this business is the common failure and says so.
      setBanner((error as Error).message || "Could not save the contact. Please try again.");
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Contact"
      description={`Update ${contact.name ?? "this contact"}'s details.`}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {banner && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{banner}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="edit-name" required error={errors.name?.message}>
            <input id="edit-name" className={inputClass} {...register("name")} />
          </Field>

          <Field label="Phone" htmlFor="edit-phone" required error={errors.phone?.message}>
            <input id="edit-phone" className={inputClass} {...register("phone")} />
          </Field>

          <Field label="Email" htmlFor="edit-email" error={errors.email?.message}>
            <input id="edit-email" type="email" className={inputClass} {...register("email")} />
          </Field>

          <Field label="Company" htmlFor="edit-company" error={errors.company?.message}>
            <input id="edit-company" className={inputClass} {...register("company")} />
          </Field>

          <Field label="Designation" htmlFor="edit-designation" error={errors.designation?.message}>
            <input id="edit-designation" className={inputClass} {...register("designation")} />
          </Field>

          <Field label="Location" htmlFor="edit-location" error={errors.location?.message}>
            <input id="edit-location" className={inputClass} {...register("location")} />
          </Field>

          <Field label="Source" htmlFor="edit-source" error={errors.source?.message}>
            <input
              id="edit-source"
              className={inputClass}
              list="edit-contact-sources"
              {...register("source")}
            />
            <datalist id="edit-contact-sources">
              {sources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field label="Notes" htmlFor="edit-notes" error={errors.notes?.message}>
          <textarea id="edit-notes" rows={3} className={inputClass} {...register("notes")} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
