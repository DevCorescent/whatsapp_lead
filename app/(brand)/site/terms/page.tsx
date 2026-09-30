// Terms of service on a white-label brand's site (/terms is rewritten here).

import { redirect } from "next/navigation";
import LegalPage from "@/components/marketing/LegalPage";
import { getRequestBrand } from "@/lib/branding";
import { defaultTerms, parseLegalText } from "@/lib/brandLegal";

export const dynamic = "force-dynamic";

export default async function BrandTermsPage() {
  const brand = await getRequestBrand();
  if (!brand.isWhiteLabel) redirect("/login");
  const custom = brand.termsContent?.trim() ? parseLegalText(brand.termsContent) : null;
  return (
    <LegalPage
      title="Terms of service"
      lastUpdated={new Date().getFullYear().toString()}
      intro={`Please read these terms carefully before using ${brand.name}.`}
      sections={custom?.length ? custom : defaultTerms(brand)}
    />
  );
}
