import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { INDUSTRIES, getIndustry } from "@/components/marketing/industries";
import { IndustryPage } from "@/components/marketing/industry/IndustryPage";

type Params = { params: Promise<{ industry: string }> };

/**
 * One page per industry.
 *
 * Every industry is known at build time, so `generateStaticParams` turns each one into
 * a static page — there is no request-time work to do for content that lives in a
 * module. An unknown slug is a 404 rather than an empty shell, which is what keeps
 * /industries/anything from rendering a page with no content on it.
 */
export function generateStaticParams() {
  return INDUSTRIES.map((industry) => ({ industry: industry.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { industry: slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) return { title: "Industry not found — WhatsCRM" };

  return {
    title: `WhatsCRM for ${industry.name} — AI WhatsApp CRM`,
    description: industry.summary,
    alternates: { canonical: `/industries/${industry.id}` },
    openGraph: {
      title: `WhatsCRM for ${industry.name}`,
      description: industry.summary,
      type: "website",
    },
  };
}

export default async function IndustryDetailPage({ params }: Params) {
  const { industry: slug } = await params;
  const industry = getIndustry(slug);

  if (!industry) notFound();

  return <IndustryPage industry={industry} />;
}
