// ROUTE : /api/admin/cms/sections
//   GET — every homepage section with its save state and item counts, for the
//         CMS overview. SUPER_ADMIN only.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readStoredSections } from "@/lib/cms/content";
import { CMS_SECTIONS, CMS_SECTION_KEYS } from "@/lib/cms/sections";
import { toEditorSection } from "@/lib/cms/store";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const stored = await readStoredSections();

    const data = CMS_SECTION_KEYS.map((key) => {
      const spec = CMS_SECTIONS[key];
      const section = toEditorSection(key, stored.get(key) ?? null);
      const items = Object.values(section.items).flat();

      return {
        key,
        label: spec.label,
        description: spec.description,
        whatsapp: "whatsapp" in spec ? spec.whatsapp : false,
        isActive: section.isActive,
        source: section.source,
        updatedAt: section.updatedAt,
        itemCount: items.length,
        activeItemCount: items.filter((item) => item.isActive).length,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[CMS] Failed to list sections:", error);
    return NextResponse.json(
      { success: false, error: "Could not load website content. Check that the CMS migration has been applied." },
      { status: 500 },
    );
  }
}
