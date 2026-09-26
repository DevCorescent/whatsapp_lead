"use client";

import { useMemo } from "react";
import { ImportWizard, type ImportWizardConfig } from "@/components/import/ImportWizard";
import { useImportContacts } from "@/hooks/useContacts";
import { IMPORT_FIELDS, validateRows, type ImportContactPayload } from "@/lib/contactsImport";

/**
 * Contact import — a thin binding of the shared `ImportWizard` to the contact field
 * map, the contact validator and the contacts bulk-import hook. All of the flow UI
 * (upload, mapping, preview, progress, report) lives in the wizard and is shared with
 * the Leads importer.
 */
export function ImportContactsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mutateAsync } = useImportContacts();

  const config = useMemo<ImportWizardConfig<ImportContactPayload>>(
    () => ({
      title: "Import Contacts",
      description: "Bring contacts in from an Excel or CSV file.",
      fields: IMPORT_FIELDS,
      validate: validateRows,
      importBatch: (payload, mode, dryRun) => mutateAsync({ contacts: payload, mode, dryRun }),
      sampleFiles: [
        { label: "Excel (.xlsx)", href: "/contacts-sample.xlsx" },
        { label: "CSV", href: "/contacts-sample.csv" },
      ],
      columnGuide: [
        { header: "Phone",       example: "+919876543210",    required: true },
        { header: "Name",        example: "Rahul Sharma" },
        { header: "Email",       example: "rahul@acme.com" },
        { header: "Company",     example: "Acme Pvt Ltd" },
        { header: "Designation", example: "Manager" },
        { header: "Location",    example: "Mumbai" },
        { header: "Source",      example: "Website" },
        { header: "Notes",       example: "Interested in plan A" },
        { header: "Tags",        example: "hot, vip" },
      ],
      mappingHint: (
        <>
          Your file needs a header row. A <span className="font-medium">Phone</span> column is
          required; all other columns are optional. Tags can be comma-separated.
        </>
      ),
    }),
    [mutateAsync],
  );

  return <ImportWizard open={open} onClose={onClose} config={config} />;
}
