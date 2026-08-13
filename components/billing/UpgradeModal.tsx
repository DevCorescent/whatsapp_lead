"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, Lock, Sparkles } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import {
  FEATURE_HINT,
  FEATURE_LABEL,
  FEATURE_TITLE,
  RESOURCE_HINT,
  RESOURCE_LABEL,
  RESOURCE_TITLE,
  type UpgradeReason,
} from "@/lib/billing/limits";

/**
 * Shown when the API refuses an action because of the tenant's plan.
 *
 * Deliberately not a red error banner. Neither refusal is a mistake the user
 * made — they are the product working as sold — so the dialog states what the
 * plan gives them and offers the one action that resolves it.
 *
 * Handles both shapes the server can send. A limit gets a usage bar, because
 * "3 of 3" is the useful fact; a feature gets a description of what they are
 * missing, because there is no number to show and the interesting question is
 * what the thing even does.
 *
 * Pass the reason from a caught LimitError/FeatureError (via `upgradeReasonOf`);
 * pass null to keep it closed.
 */
export function UpgradeModal({
  reason,
  onClose,
}: {
  reason: UpgradeReason | null;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!reason) {
    return (
      <Modal open={false} onClose={onClose} title="Upgrade required">
        {null}
      </Modal>
    );
  }

  const isLimit = reason.kind === "limit";

  const title = isLimit ? RESOURCE_TITLE[reason.resource] : FEATURE_TITLE[reason.feature];
  const hint = isLimit ? RESOURCE_HINT[reason.resource] : FEATURE_HINT[reason.feature];
  const description = isLimit
    ? `Your ${reason.planName} plan includes ${reason.limit.toLocaleString("en-IN")} ${RESOURCE_LABEL[reason.resource]}.`
    : `${FEATURE_LABEL[reason.feature]} isn't included in the ${reason.planName} plan.`;

  return (
    <Modal open onClose={onClose} title={title} description={description}>
      <div className="space-y-5">
        {isLimit ? (
          <UsageBar used={reason.used} limit={reason.limit} label={RESOURCE_LABEL[reason.resource]} />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Lock className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-violet-900">
              {FEATURE_LABEL[reason.feature]}
            </span>
          </div>
        )}

        <p className="text-sm leading-relaxed text-slate-600">{hint}</p>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose();
              router.push("/billing/plans");
            }}
          >
            <Sparkles className="h-4 w-4" />
            View plans
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  // Clamped because `used` can legitimately exceed `limit`: a plan edited down,
  // or a tenant grandfathered above the ceiling, both report more than 100%.
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-amber-900">{label}</span>
        <span className="font-mono text-sm text-amber-900">
          {used.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")}
        </span>
      </div>
      <div
        className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} used`}
      >
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
