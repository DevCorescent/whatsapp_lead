"use client";

import { useMemo } from "react";
import { ImportWizard, type ImportWizardConfig } from "@/components/import/ImportWizard";
import { useImportLeads } from "@/hooks/useLeads";
import { useLeadStages } from "@/hooks/useLeadStages";
import { useTeam } from "@/hooks/useTeam";
import {
  LEAD_IMPORT_FIELDS,
  validateLeadRows,
  type ImportLeadPayload,
  type LeadImportContext,
} from "@/lib/leadsImport";

/**
 * Lead import — the lead binding of the shared `ImportWizard`. Reuses the exact flow,
 * parser, validation model and preview from the Contacts importer; the only lead-specific
 * pieces are the field map, the stage/assignee-aware validator (fed the tenant's live
 * stages and team) and the leads bulk-import hook.
 */
export function ImportLeadsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mutateAsync } = useImportLeads();
  const { stages, isLoading: stagesLoading } = useLeadStages();
  const { data: teamData, isLoading: teamLoading } = useTeam();

  const users = useMemo<LeadImportContext["users"]>(() => {
    const list = (teamData as { data?: unknown })?.data;
    const arr = Array.isArray(list) ? list : Array.isArray(teamData) ? teamData : [];
    return (arr as unknown[]).flatMap((u) => {
      if (!u || typeof u !== "object") return [];
      const rec = u as Record<string, unknown>;
      if (typeof rec.id !== "string" || typeof rec.email !== "string") return [];
      return [{ id: rec.id, name: typeof rec.name === "string" ? rec.name : null, email: rec.email }];
    });
  }, [teamData]);

  const stageNames = useMemo(() => stages.map((s) => s.name), [stages]);

  const config = useMemo<ImportWizardConfig<ImportLeadPayload>>(
    () => ({
      title: "Import Leads",
      description: "Bring leads in from an Excel or CSV file.",
      fields: LEAD_IMPORT_FIELDS,
      validate: (rows, mapping) => validateLeadRows(rows, mapping, { stageNames, users }),
      importBatch: (payload, mode, dryRun) => mutateAsync({ leads: payload, mode, dryRun }),
      busy: stagesLoading || teamLoading,
      mappingHint: (
        <>
          A <span className="font-medium">Phone</span> column is required. Stage and Assigned To are
          matched to your existing pipeline stages and team members — unknown values are flagged and
          never created. Each lead links to a contact (created if new).
        </>
      ),
    }),
    [mutateAsync, stageNames, users, stagesLoading, teamLoading],
  );

  return <ImportWizard open={open} onClose={onClose} config={config} />;
}
