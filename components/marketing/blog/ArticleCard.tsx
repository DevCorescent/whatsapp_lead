import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Thumbnail } from "./Thumbnail";
import type { Post } from "./posts";

/**
 * One article in the grid.
 *
 * The whole card is a single link rather than a card containing a link on the title:
 * a reader aiming at a card expects the card to be clickable, and nesting a second
 * anchor inside it would produce invalid markup and two tab stops for one destination.
 *
 * `group` drives everything on hover — the lift, the ring, the emerald glow and the
 * thumbnail's scale — so there is one hover state per card, not four competing ones.
 */
export function ArticleCard({
  post,
  featured = false,
  className,
}: {
  post: Post;
  /** Wide layout for the lead article: cover on the left, text on the right. */
  featured?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white",
        "shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300",
        "hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        featured && "sm:flex-row",
        className,
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border-b border-slate-100",
          featured ? "h-52 sm:h-auto sm:w-[46%] sm:border-b-0 sm:border-r" : "h-44",
        )}
      >
        <Thumbnail motif={post.motif} />
      </div>

      <div className={cn("flex flex-1 flex-col p-6", featured && "sm:p-8")}>
        <div className="flex items-center gap-2">
          <span className="w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            {post.category}
          </span>
          {featured && (
            <span className="w-fit rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
              Latest
            </span>
          )}
        </div>

        <h3
          className={cn(
            "mt-4 font-semibold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-emerald-700",
            featured ? "text-xl sm:text-2xl" : "text-lg",
          )}
        >
          {post.title}
        </h3>

        <p
          className={cn(
            "mt-2 flex-1 leading-relaxed text-slate-600",
            featured ? "text-[15px]" : "text-sm",
          )}
        >
          {post.excerpt}
        </p>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
            >
              {initialsOf(post.author)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-900">
                {post.author}
              </span>
              <time dateTime={post.isoDate} className="block text-xs text-slate-500">
                {post.date}
              </time>
            </span>
          </div>

          <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            {post.readTime}
          </span>
        </div>
      </div>

      {/* Affordance only — the whole card is already the link. */}
      <span
        aria-hidden
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-400 opacity-0 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur transition duration-300 group-hover:opacity-100 group-hover:text-emerald-600"
      >
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
