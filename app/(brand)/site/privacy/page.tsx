// Privacy policy on a white-label brand's site (/privacy-policy is rewritten here).

import { redirect } from "next/navigation";
import LegalPage from "@/components/marketing/LegalPage";
import { getRequestBrand } from "@/lib/branding";
import { defaultPrivacy, parseLegalText } from "@/lib/brandLegal";

export const dynamic = "force-dynamic";

export default async function BrandPrivacyPage() {
  const brand = await getRequestBrand();
  if (!brand.isWhiteLabel) redirect("/login");
  const custom = brand.privacyContent?.trim() ? parseLegalText(brand.privacyContent) : null;
  return (
    <LegalPage
      title="Privacy policy"
      lastUpdated={new Date().getFullYear().toString()}
      intro={`How ${brand.name} collects, uses and protects personal data.`}
      sections={custom?.length ? custom : defaultPrivacy(brand)}
    />
  );
}
