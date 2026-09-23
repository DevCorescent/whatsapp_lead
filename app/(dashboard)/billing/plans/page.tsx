"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Check, Sparkles, ArrowLeft } from "lucide-react";
import { Badge, Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import {
  fetchPlanChangeQuote,
  useBillingPlans,
  useCheckout,
  useChangePlan,
  useVerifyPayment,
  type PlanChangeQuote,
  type PlanDTO,
  type RazorpayOrderData,
} from "@/hooks/useBilling";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.head.appendChild(script);
  });
}

export default function PlansPage() {
  const { data, isLoading } = useBillingPlans();
  const checkout = useCheckout();
  const change = useChangePlan();
  const verifyPayment = useVerifyPayment();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);
  const [quote, setQuote] = useState<PlanChangeQuote | null>(null);
  const [confirming, setConfirming] = useState(false);

  const plans = data?.plans ?? [];
  const currentPlanId = data?.currentPlanId ?? null;
  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;
  const hasActivePaid = Boolean(
    currentPlan && currentPlan.priceMonthly > 0 && data?.status === "ACTIVE",
  );

  /** Open the Razorpay checkout modal and verify the payment on success. */
  const openRazorpayModal = useCallback(
    (orderData: RazorpayOrderData, planId: string): Promise<void> => {
      return new Promise(async (resolve, reject) => {
        try {
          await loadRazorpayScript();
        } catch (e) {
          reject(e);
          return;
        }

        const rzp = new window.Razorpay({
          key: orderData.keyId,
          order_id: orderData.orderId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "WhatsCRM",
          description: orderData.planName,
          theme: { color: "#10b981" },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              await verifyPayment.mutateAsync({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planId,
                planChangeId: orderData.planChangeId,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () => resolve(),
          },
        });
        rzp.open();
      });
    },
    [verifyPayment],
  );

  const choose = async (plan: PlanDTO) => {
    setBusyId(plan.id);
    setPlanError(null);
    setPlanSuccess(null);
    try {
      if (hasActivePaid && plan.priceMonthly > 0) {
        setQuote(await fetchPlanChangeQuote(plan.id));
        return;
      }
      const res = await checkout.mutateAsync(plan.id);
      if (res?.orderId) {
        await openRazorpayModal(res as RazorpayOrderData, plan.id);
        setPlanSuccess("Your plan is now active.");
        return;
      }
      // Free plan assigned directly.
      setPlanSuccess("Your plan is now active.");
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmChange = async () => {
    if (!quote) return;
    setConfirming(true);
    setPlanError(null);
    try {
      const res = await change.mutateAsync(quote.targetPlan.id);
      if (res?.orderId) {
        await openRazorpayModal(
          { ...(res as RazorpayOrderData), planChangeId: res.planChangeId },
          quote.targetPlan.id,
        );
        setQuote(null);
        setPlanSuccess(`You're now on ${quote.targetPlan.displayName}.`);
        return;
      }
      setQuote(null);
      setPlanSuccess(
        res?.grantedDays
          ? `You're on ${quote.targetPlan.displayName}. Your remaining balance covers ${res.grantedDays} days, through ${new Date(res.periodEnd).toLocaleDateString()}.`
          : `You're now on ${quote.targetPlan.displayName}.`,
      );
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setConfirming(false);
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
          Payments are not configured on this deployment. Free plans can still be selected; paid checkout is disabled until Razorpay is connected.
        </div>
      )}

      {planError && (
        <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{planError}</div>
      )}
      {planSuccess && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{planSuccess}</div>
      )}

      {quote && (
        <Card className="mb-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900">
                {quote.kind === "UPGRADE" ? "Confirm upgrade" : "Confirm downgrade"}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {quote.currentPlan.displayName} → {quote.targetPlan.displayName}
              </p>
            </div>
            <Badge
              className={
                quote.kind === "UPGRADE"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                  : "bg-slate-50 text-slate-600 ring-slate-500/15"
              }
            >
              {quote.kind === "UPGRADE" ? "Upgrade" : "Downgrade"}
            </Badge>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {quote.requiresPayment ? "Due now" : "To pay"}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                {quote.requiresPayment ? formatCurrency(quote.amountDue) : "Nothing"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Credit for unused time
              </dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                {formatCurrency(quote.credit)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {quote.kind === "UPGRADE" ? "Renews" : "New period ends"}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                {new Date(quote.periodEnd).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-sm text-slate-600">
            {quote.kind === "UPGRADE" ? (
              quote.requiresPayment ? (
                <>
                  You&apos;ll pay the difference for the rest of your current period. Your renewal
                  date doesn&apos;t change, and the upgrade applies once payment is confirmed.
                </>
              ) : (
                <>There&apos;s nothing left to charge for this period, so the upgrade applies right away.</>
              )
            ) : (
              <>
                Your remaining balance carries over as {quote.grantedDays} days on{" "}
                {quote.targetPlan.displayName}. Nothing you&apos;ve already paid for is lost.
              </>
            )}
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setQuote(null)} disabled={confirming}>
              Cancel
            </Button>
            <Button onClick={confirmChange} disabled={confirming}>
              {confirming
                ? "Working…"
                : quote.requiresPayment
                  ? `Pay ${formatCurrency(quote.amountDue)}`
                  : quote.kind === "UPGRADE"
                    ? "Upgrade"
                    : "Confirm downgrade"}
            </Button>
          </div>
        </Card>
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
