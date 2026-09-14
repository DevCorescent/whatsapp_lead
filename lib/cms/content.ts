// ============================================================================
// MODULE : Website CMS — server loader
// ============================================================================
//
// How the public site reads CMS content, and how the admin routes read a single
// section. Server-only: it imports Prisma.
//
// CACHED, AND INVALIDATED ON SAVE. The homepage and every marketing page (via the
// footer) read this, so it goes through Next's data cache under one tag rather
// than querying on every request. The admin save route expires the tag, so a
// change is live on the next page load rather than after a timer.
//
// NEVER AN ERROR PAGE. If the database is unreachable, or this deploy has not had
// its migration applied yet, the site renders the shipped defaults. The failure
// is thrown inside the cached function and caught outside it, so a failed read is
// never cached — the next request tries the database again.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CMS_SECTION_KEYS, type HomeContent, type PublicSection, type SectionKey } from "./sections";
import { toPublicSection, type StoredSection } from "./store";

export const CMS_PAGE = "home";
export const CMS_CACHE_TAG = "cms:home";

type SectionRow = Awaited<ReturnType<typeof findSections>>[number];

function findSections(where: { key?: string } = {}) {
  return prisma.cmsSection.findMany({
    where: { page: CMS_PAGE, ...where },
    include: { items: true },
  });
}

function toStored(row: SectionRow): StoredSection {
  return {
    isActive: row.isActive,
    content: row.content,
    itemKinds: row.itemKinds,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      data: item.data,
    })),
  };
}

export function buildHomeContent(stored: Map<string, StoredSection>): HomeContent {
  return Object.fromEntries(
    CMS_SECTION_KEYS.map((key) => [key, toPublicSection(key, stored.get(key) ?? null)]),
  ) as HomeContent;
}

type CachedSection = Omit<StoredSection, "updatedAt"> & { key: string; updatedAt: string };

/**
 * The cache holds the saved ROWS, never the merged page content.
 *
 * Merging with lib/cms/sections.ts and lib/cms/defaults.ts happens on every render,
 * outside the cache. Caching the merged result instead meant a deploy that added a
 * section, or reworded a default, kept serving the previous build's object until an
 * admin happened to save — a missing section key crashed the homepage prerender.
 * Rows only change when an admin saves, and every save expires this tag.
 *
 * Dates are carried as ISO strings because the data cache stores JSON.
 */
const loadSavedSections = unstable_cache(
  async (): Promise<CachedSection[]> => {
    const rows = await findSections();
    return rows.map((row) => ({ ...toStored(row), key: row.key, updatedAt: row.updatedAt.toISOString() }));
  },
  ["cms-home-sections-v1"],
  { tags: [CMS_CACHE_TAG] },
);

/** Published homepage content: active sections and items, in order, defaults filled in. */
export async function getHomeContent(): Promise<HomeContent> {
  try {
    const saved = await loadSavedSections();
    return buildHomeContent(
      new Map(saved.map(({ key, updatedAt, ...row }) => [key, { ...row, updatedAt: new Date(updatedAt) }])),
    );
  } catch (error) {
    console.warn(
      "[CMS] Rendering default website content — could not read saved content:",
      error instanceof Error ? error.message.split("\n")[0] : error,
    );
    return buildHomeContent(new Map());
  }
}

export async function getSection<K extends SectionKey>(key: K): Promise<PublicSection<K>> {
  const content = await getHomeContent();
  return content[key];
}

/** One section straight from the database, uncached — for the admin editor. */
export async function readStoredSection(key: SectionKey): Promise<StoredSection | null> {
  const [row] = await findSections({ key });
  return row ? toStored(row) : null;
}

/** Every saved section, uncached — for the admin overview. */
export async function readStoredSections(): Promise<Map<string, StoredSection>> {
  const rows = await findSections();
  return new Map(rows.map((row) => [row.key, toStored(row)]));
}
