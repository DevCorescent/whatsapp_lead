export type Plan = {
  id: "STARTER" | "GROWTH" | "ENTERPRISE";
  name: string;
  tagline: string;
  monthlyPrice: number;
  features: string[];
  isPopular: boolean;
  cta: string;
};

// Annual billing gives 20% off — the monthly price is shown struck through.
export const ANNUAL_DISCOUNT = 0.2;

export const PLANS: Plan[] = [
  {
    id: "STARTER",
    name: "Starter",
    tagline: "For small teams getting started on WhatsApp.",
    monthlyPrice: 999,
    isPopular: false,
    cta: "Get Started",
    features: [
      "1,000 contacts",
      "5,000 messages / month",
      "3 agent seats",
      "Shared WhatsApp inbox",
      "Lead pipeline & CRM",
      "Email support",
    ],
  },
  {
    id: "GROWTH",
    name: "Growth",
    tagline: "For growing sales teams that need AI on their side.",
    monthlyPrice: 2999,
    isPopular: true,
    cta: "Get Started",
    features: [
      "10,000 contacts",
      "50,000 messages / month",
      "10 agent seats",
      "AI auto-reply & lead qualification",
      "Bulk campaigns & templates",
      "Analytics dashboard",
      "Knowledge base (RAG)",
      "Priority support",
    ],
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    tagline: "For large teams that need scale, control and white label.",
    monthlyPrice: 9999,
    isPopular: false,
    cta: "Contact Sales",
    features: [
      "Unlimited contacts",
      "Unlimited messages",
      "Unlimited agent seats",
      "White label & custom domain",
      "Dedicated account manager",
      "Custom integrations & API access",
      "99.9% uptime SLA",
      "24×7 dedicated support",
    ],
  },
];

export function annualMonthlyPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice * (1 - ANNUAL_DISCOUNT));
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
