import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Clock, List } from "lucide-react";
import { Container, Reveal } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";
import { ArticleCard } from "@/components/marketing/blog/ArticleCard";
import { BlogCta } from "@/components/marketing/blog/BlogCta";
import { Thumbnail } from "@/components/marketing/blog/Thumbnail";
import { POSTS, getPost, getRelated } from "@/components/marketing/blog/posts";

type Params = { params: Promise<{ slug: string }> };

/**
 * Article detail.
 *
 * Every article is known at build time, so `generateStaticParams` turns each one into a
 * static page — there is no request-time work to do for content that lives in a module.
 */
export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Article not found — WhatsCRM" };

  return {
    title: `${post.title} — WhatsCRM`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.isoDate,
      authors: [post.author],
    },
  };
}

/** Stable anchor ids, so the contents list and the headings agree. */
function anchorId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);

  // An unknown slug is a 404, not an empty article shell.
  if (!post) notFound();

  const related = getRelated(slug);

  return (
    <div className="bg-white">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-emerald-50/50 to-white pb-10 pt-10 sm:pb-12 sm:pt-14">
        <Container>
          <Reveal>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <li>
                  <Link
                    href="/blog"
                    className="rounded transition hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    Blog
                  </Link>
                </li>
                <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-slate-300" />
                <li className="font-medium text-emerald-700">{post.category}</li>
              </ol>
            </nav>
          </Reveal>

          <div className="mx-auto mt-6 max-w-3xl lg:mx-0">
            <Reveal delay={60}>
              <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-balance text-slate-900 sm:text-4xl lg:text-[2.75rem]">
                {post.title}
              </h1>
            </Reveal>

            <Reveal delay={130}>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">{post.intro}</p>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-slate-100 pt-6">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
                >
                  {initialsOf(post.author)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{post.author}</span>
                  <span className="block text-xs text-slate-500">{post.role}</span>
                </span>

                <span aria-hidden className="hidden h-8 w-px bg-slate-200 sm:block" />

                <time dateTime={post.isoDate} className="text-sm text-slate-500">
                  {post.date}
                </time>
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {post.readTime}
                </span>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Cover ───────────────────────────────────────────────────────── */}
      <Container>
        <Reveal delay={80}>
          <div className="group mx-auto max-w-3xl overflow-hidden rounded-2xl shadow-lg shadow-slate-900/5 ring-1 ring-inset ring-slate-900/5 lg:mx-0">
            <div className="h-56 sm:h-72 lg:h-80">
              <Thumbnail motif={post.motif} />
            </div>
          </div>
        </Reveal>
      </Container>

      {/* ── Body + contents ─────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
            <article className="mx-auto min-w-0 max-w-3xl lg:mx-0">
              {post.sections.map((section, i) => (
                <Reveal key={section.heading} delay={i * 40} className="scroll-mt-24">
                  <div id={anchorId(section.heading)} className="scroll-mt-24">
                    <h2
                      className={
                        "text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl " +
                        (i === 0 ? "" : "mt-12")
                      }
                    >
                      {section.heading}
                    </h2>

                    {section.body.map((paragraph, p) => (
                      <p
                        key={p}
                        className="mt-4 text-[15px] leading-[1.75] text-slate-700 sm:text-base"
                      >
                        {paragraph}
                      </p>
                    ))}

                    {section.list && (
                      <ul className="mt-5 space-y-2.5">
                        {section.list.map((item, li) => (
                          <li
                            key={li}
                            style={stagger(li, 70, 60)}
                            className="wa-lift flex gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-900/5"
                          >
                            <span
                              aria-hidden
                              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                            />
                            <span className="text-[15px] leading-relaxed text-slate-700">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Reveal>
              ))}

              <Reveal>
                <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-8">
                  <Link
                    href="/blog"
                    className="group inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                    All articles
                  </Link>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    {post.category}
                  </span>
                </div>
              </Reveal>
            </article>

            {/* Contents. Hidden below lg — a table of contents above the article on a
                phone is a wall the reader has to scroll past to reach the writing. */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <Reveal delay={120}>
                  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <List className="h-3.5 w-3.5 text-emerald-600" />
                      On this page
                    </p>
                    <ul className="mt-3 space-y-0.5">
                      {post.sections.map((section) => (
                        <li key={section.heading}>
                          <a
                            href={`#${anchorId(section.heading)}`}
                            className="block rounded-lg px-3 py-2 text-sm leading-snug text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600"
                          >
                            {section.heading}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      {/* ── Related ─────────────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="border-t border-slate-100 bg-slate-50/60 py-16 sm:py-20">
          <Container>
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                    Keep reading
                  </p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Related articles
                  </h2>
                </div>
                <Link
                  href="/blog"
                  className="text-sm font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4 transition hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  All articles →
                </Link>
              </div>
            </Reveal>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item, i) => (
                <Reveal key={item.slug} delay={80 + i * 70} className="h-full">
                  <ArticleCard post={item} className="h-full" />
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      )}

      <BlogCta />
    </div>
  );
}
