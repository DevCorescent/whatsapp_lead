"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, ArrowLeft } from "lucide-react";
import { Badge, Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import {
  useBillingPlans,
  useCheckout,
  useChangePlan,
  type PlanDTO,
} from "@/hooks/useBilling";

export default function PlansPage() {
  const { data, isLoading } = useBillingPlans();
  const checkout = useCheckout();
  const change = useChangePlan();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);

  const plans = data?.plans ?? [];
  const currentPlanId = data?.currentPlanId ?? null;
  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;
  // stripePriceId, not just a non-zero price. A workspace on a custom tier pays
  // against an invoice rather than a Stripe subscription, so there is no
  // subscription item to swap and /api/billing/change would refuse — sending it
  // there would dead-end the one customer most likely to be calling their rep.
  // Checkout is the right path: it creates the Stripe subscription they lack.
  const hasActivePaid = Boolean(
    currentPlan && currentPlan.priceMonthly > 0 && currentPlan.stripePriceId && data?.status === "ACTIVE",
  );

  const choose = async (plan: PlanDTO) => {
    setBusyId(plan.id);
    setPlanError(null);
    setPlanSuccess(null);
    try {
      // An existing paid subscriber switching plans goes through change (proration);
      // otherwise start a fresh checkout.
      if (hasActivePaid && plan.priceMonthly > 0) {
        await change.mutateAsync(plan.id);
        setPlanSuccess("Your plan has been updated.");
      } else {
        const res = await checkout.mutateAsync(plan.id);
        if (res?.url) {
          window.location.assign(res.url);
          return;
        }
        setPlanSuccess("Your plan is now active.");
      }
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Choose the plan that fits your team. Upgrade or downgrade anytime."
        action={
          <Link href="/billing">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Back to billing
            </Button>
          </Link>
        }
      />

      {data && !data.billingEnabled && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Payments are not configured on this deployment. Free plans can still be selected; paid checkout is disabled until Stripe is connected.
        </div>
      )}

      {planError && (
        <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{planError}</div>
      )}
      {planSuccess && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{planSuccess}</div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5"><Skeleton className="h-64 w-full" /></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isDowngrade = currentPlan ? plan.priceMonthly < currentPlan.priceMonthly : false;
            const cta = isCurrent
              ? "Current plan"
              : plan.priceMonthly <= 0
                ? "Switch to Free"
                : isDowngrade
                  ? "Downgrade"
                  : currentPlan
                    ? "Upgrade"
                    : "Choose plan";

            return (
              <Card key={plan.id} className={cn("flex flex-col p-5", isCurrent && "ring-2 ring-emerald-500")}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">{plan.displayName || plan.name}</h3>
                  <span className="flex items-center gap-1.5">
                    {/* A tier built for this workspace alone. It appears here
                        only because they are on it — see listPlansFor. */}
                    {plan.visibility === "PRIVATE" && (
                      <Badge className="bg-violet-50 text-violet-700 ring-violet-600/20">Custom</Badge>
                    )}
                    {isCurrent && (
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                        <Sparkles className="mr-1 h-3 w-3" />
                        Current
                      </Badge>
                    )}
                  </span>
                </div>

                <p className="mt-2">
                  <span className="text-2xl font-bold text-slate-900">{formatCurrency(plan.priceMonthly)}</span>
                  <span className="text-sm text-slate-500"> / month</span>
                </p>
                {plan.description && <p className="mt-1 text-sm text-slate-500">{plan.description}</p>}

                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                  <Feature>{plan.maxAgents <= 0 ? "Unlimited" : plan.maxAgents} agent seats</Feature>
                  <Feature>{plan.maxContacts <= 0 ? "Unlimited" : plan.maxContacts.toLocaleString()} contacts</Feature>
                  <Feature>{plan.maxCampaigns <= 0 ? "Unlimited" : plan.maxCampaigns} campaigns / month</Feature>
                  <Feature>{plan.maxStorageMb <= 0 ? "Unlimited" : `${plan.maxStorageMb} MB`} storage</Feature>
                  <Feature>{plan.aiCredits <= 0 ? "Unlimited" : plan.aiCredits} AI credits / month</Feature>
                  {plan.features.map((f) => (
                    <Feature key={f}>{f}</Feature>
                  ))}
                </ul>

                <Button
                  className="mt-5 w-full justify-center"
                  variant={isCurrent ? "secondary" : "primary"}
                  disabled={isCurrent || busyId === plan.id || (plan.priceMonthly > 0 && !data?.billingEnabled)}
                  onClick={() => choose(plan)}
                >
                  {busyId === plan.id ? "Working…" : cta}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}
