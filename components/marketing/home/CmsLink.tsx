import Link from "next/link";
import type { ReactNode } from "react";
import { isExternalHref } from "@/lib/cms/fields";

/**
 * A link whose destination an admin typed.
 *
 * Site paths and anchors go through next/link; full https:// URLs open in a new
 * tab with `noopener`. Every href reaching this component has already passed
 * lib/cms/fields.ts (validated on save, re-checked on read), so it never renders
 * a scripted URL.
 */
export function CmsLink({
  href,
  className,
  children,
  ariaLabel,
  tabIndex,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  tabIndex?: number;
}) {
  if (isExternalHref(href) || href.startsWith("mailto:") || href.startsWith("tel:")) {
    const external = isExternalHref(href);
    return (
      <a
        href={href}
        className={className}
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} aria-label={ariaLabel} tabIndex={tabIndex}>
      {children}
    </Link>
  );
}
