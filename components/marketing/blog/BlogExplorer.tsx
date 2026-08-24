"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/marketing/home/primitives";
import { ArticleCard } from "./ArticleCard";
import { NewsletterCard } from "./NewsletterCard";
import { CATEGORIES, type Post, type PostCategory } from "./posts";

/**
 * The listing page's interactive half: search, category filter, grid and sidebar.
 *
 * All four share one piece of state, so they live in one client component rather than
 * being lifted into the page — the page itself stays a server component and ships the
 * article data as props.
 *
 * Filtering happens in memory. Ten posts is not a search problem, and a debounced
 * request to an endpoint that does not exist would be ceremony rather than engineering.
 */

type Filter = PostCategory | "All";

export function BlogExplorer({ posts }: { posts: Post[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Filter>("All");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (category !== "All" && post.category !== category) return false;
      if (!needle) return true;
      return (
        post.title.toLowerCase().includes(needle) ||
        post.excerpt.toLowerCase().includes(needle) ||
        post.category.toLowerCase().includes(needle) ||
        post.author.toLowerCase().includes(needle)
      );
    });
  }, [posts, query, category]);

  // The wide lead card only makes sense on the unfiltered view. Once someone has
  // narrowed the list, promoting one result above the others is arbitrary.
  const isBrowsing = category === "All" && query.trim() === "";
  const [lead, ...rest] = filtered;
  const gridPosts = isBrowsing ? rest : filtered;

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([["All", posts.length]]);
    for (const item of CATEGORIES) {
      map.set(item, posts.filter((post) => post.category === item).length);
    }
    return map;
  }, [posts]);

  const isFiltering = category !== "All" || query.trim() !== "";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="min-w-0">
        {/* Category chips. flex-wrap rather than a scrolling rail: a rail hides
            categories behind a gesture people do not know is available. */}
        <Reveal>
          <div className="flex flex-wrap items-center gap-2">
            {(["All", ...CATEGORIES] as Filter[]).map((item) => {
              const active = category === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-medium transition duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                    active
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                      : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-300",
                  )}
                >
                  {item}
                  <span
                    className={cn(
                      "nums ml-1.5 text-xs",
                      active ? "text-emerald-100" : "text-slate-400",
                    )}
                  >
                    {counts.get(item) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </Reveal>

        {isFiltering && (
          <p className="mt-5 flex items-center gap-2 text-sm text-slate-500">
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-600" />
            <span className="nums">{filtered.length}</span>
            {filtered.length === 1 ? "article" : "articles"}
            {category !== "All" && <> in {category}</>}
            {query.trim() && <> matching &ldquo;{query.trim()}&rdquo;</>}
            <button
              type="button"
              onClick={() => {
                setCategory("All");
                setQuery("");
              }}
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-inset ring-slate-900/5">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-900/5">
              <Search className="h-5 w-5 text-slate-400" />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-900">No articles yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
              Nothing matches that search. Try a broader term, or browse another category.
            </p>
            <button
              type="button"
              onClick={() => {
                setCategory("All");
                setQuery("");
              }}
              className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Show all articles
            </button>
          </div>
        ) : (
          // Keyed on the filter so a category change remounts the list and the reveal
          // animation replays. Without the key React reuses the nodes and the change
          // happens with no transition at all.
          <div key={`${category}-${query.trim()}`}>
            {isBrowsing && lead && (
              <Reveal delay={60} className="mt-8">
                <ArticleCard post={lead} featured />
              </Reveal>
            )}

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {gridPosts.map((post, i) => (
                <Reveal key={post.slug} delay={80 + i * 60} className="h-full">
                  <ArticleCard post={post} className="h-full" />
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Reveal delay={60}>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5">
            <label
              htmlFor="blog-search"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Search
            </label>
            <div className="relative mt-2.5">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                id="blog-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search articles…"
                className="w-full rounded-lg bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
              />
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Categories
            </p>
            <ul className="mt-3 space-y-0.5">
              {(["All", ...CATEGORIES] as Filter[]).map((item) => {
                const active = category === item;
                return (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => setCategory(item)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600",
                        active
                          ? "bg-emerald-50 font-semibold text-emerald-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      )}
                    >
                      <span className="truncate">{item}</span>
                      <span
                        className={cn(
                          "nums shrink-0 text-xs",
                          active ? "text-emerald-600" : "text-slate-400",
                        )}
                      >
                        {counts.get(item) ?? 0}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={180}>
          <NewsletterCard />
        </Reveal>
      </aside>
    </div>
  );
}
