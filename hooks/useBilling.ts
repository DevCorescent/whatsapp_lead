import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface UsageMetric {
  label: string;
  used: number;
  limit: number;
}

export interface BillingSummary {
  planId: string | null;
  planName: string;
  priceMonthly: number;
  status: string;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  hasStripe: boolean;
  hasRazorpay: boolean;
  usage: {
    contacts: UsageMetric;
    messages: UsageMetric;
    agents: UsageMetric;
    campaigns: UsageMetric;
    storage: UsageMetric;
    ai: UsageMetric;
  };
  invoices: {
    id: string;
    number: string;
    date: string;
    amount: number;
    status: string;
    url: string | null;
    pdf: string | null;
  }[];
}

export interface RazorpayOrderData {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
  planChangeId?: string;
}

export interface PlanDTO {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  priceMonthly: number;
  priceAnnual: number;
  maxContacts: number;
  maxMsgPerMonth: number;
  maxAgents: number;
  maxCampaigns: number;
  maxStorageMb: number;
  aiCredits: number;
  stripePriceId: string | null;
  features: string[];
  sortOrder: number;
  /** PRIVATE marks a custom tier. Only ever this tenant's own — see lib/billing/plans.ts. */
  visibility: "PUBLIC" | "PRIVATE";
}

export interface PlansResponse {
  plans: PlanDTO[];
  currentPlanId: string | null;
  status: string | null;
  billingEnabled: boolean;
}

export function useBilling() {
  return useQuery<BillingSummary>({
    queryKey: ["billing"],
    queryFn: async () => {
      const res = await fetch("/api/billing");
      if (!res.ok) throw new Error(`Failed to load billing (${res.status})`);
      return res.json();
    },
    retry: false,
  });
}

export function useBillingPlans() {
  return useQuery<PlansResponse>({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const res = await fetch("/api/billing/plans");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to load plans");
      return json.data as PlansResponse;
    },
  });
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error((json as { error?: string }).error ?? "Request failed");
  }
  return json.data ?? json;
}

/** Start checkout (paid → returns Stripe URL to redirect to; free → assigned). */
export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => post("/api/billing/checkout", { planId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing"] }),
  });
}

/**
 * What a plan change costs and what it results in, priced by the server.
 *
 * Every figure here is computed in /api/billing/change from the plans and the
 * subscription in the database. Nothing in this shape is recalculated in the
 * browser — a price worked out client-side is a price that can disagree with the
 * one actually charged, and the customer would be right to believe the screen.
 */
export interface PlanChangeQuote {
  kind: "UPGRADE" | "DOWNGRADE";
  currentPlan: { id: string; displayName: string };
  targetPlan: { id: string; displayName: string };
  /** Payable now, in rupees, already rounded by the server. */
  amountDue: number;
  amountDueMinor: number;
  /** Unused value of the current plan, credited against the change. */
  credit: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  /** Days the carried-over value buys on the cheaper plan. Downgrades only. */
  grantedDays: number | null;
  requiresPayment: boolean;
}

/** Ask the server to price a move onto `planId`. Read-only — changes nothing. */
export async function fetchPlanChangeQuote(planId: string): Promise<PlanChangeQuote> {
  const res = await fetch(`/api/billing/change?planId=${encodeURIComponent(planId)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error((json as { error?: string }).error ?? "Could not price this change");
  }
  return json.data as PlanChangeQuote;
}

export function useChangePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => post("/api/billing/change", { planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      queryClient.invalidateQueries({ queryKey: ["billing-plans"] });
    },
  });
}

export function useBillingPortal() {
  return useMutation({ mutationFn: () => post("/api/billing/portal") });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => post("/api/billing/cancel"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing"] }),
  });
}

export function useResumeSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => post("/api/billing/resume"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing"] }),
  });
}

export interface VerifyPaymentInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  planId: string;
  planChangeId?: string;
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VerifyPaymentInput) => post("/api/billing/verify-payment", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      queryClient.invalidateQueries({ queryKey: ["billing-plans"] });
    },
  });
}
