import { notFound } from "next/navigation";
import { CmsSectionPage } from "@/components/admin/cms/SectionEditor";
import { isSectionKey } from "@/lib/cms/sections";

/** Website CMS · one homepage section (SUPER_ADMIN — guarded by the admin layout and proxy). */
export default async function CmsSectionRoute({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSectionKey(section)) notFound();
  return <CmsSectionPage sectionKey={section} />;
}
