// ============================================================================
// MODULE : Platform hosts (edge-safe — no Prisma, used by proxy.ts)
//
// The hosts that serve the platform's own site. Any other host pointed at this
// deployment is a white-label reseller's: either its custom domain
// (WhiteLabelConfig.domain) or its free subdomain of the platform's root domain,
// "<subdomain>.<PLATFORM_ROOT_DOMAIN>" (WhiteLabelConfig.subdomain).
//
// Configure with NEXT_PUBLIC_APP_URL, an optional comma-separated PLATFORM_HOSTS
// (e.g. "whatscrm.app,app.whatscrm.app"), and PLATFORM_ROOT_DOMAIN (e.g.
// "whatscrm.app", with a wildcard DNS record *.whatscrm.app → this deployment)
// to give resellers free subdomains.
// ============================================================================

/** Subdomains of the root domain that belong to the platform, never to a reseller. */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "admin", "api", "mail", "smtp", "ftp", "static", "cdn", "assets", "docs",
  "blog", "help", "support", "status", "billing", "dashboard", "login", "auth", "demo", "staging", "dev",
]);

/** "https://Crm.Acme.com:443/x" → "crm.acme.com". */
export function normalizeHost(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");
}

export function platformRootDomain(): string | null {
  return normalizeHost(process.env.PLATFORM_ROOT_DOMAIN) || null;
}

/**
 * The reseller subdomain in a host, e.g. "acme" for "acme.whatscrm.app", or null
 * when the host isn't a (non-reserved) subdomain of the root domain.
 */
export function subdomainOf(host: string | null | undefined): string | null {
  const root = platformRootDomain();
  const h = normalizeHost(host);
  if (!root || !h.endsWith(`.${root}`)) return null;
  const sub = h.slice(0, -(root.length + 1));
  if (!sub || sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export function isPlatformHost(host: string | null | undefined): boolean {
  const h = normalizeHost(host);
  if (!h || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")) return true;
  // A reseller's free subdomain is theirs, not the platform's.
  if (subdomainOf(h)) return false;
  const root = platformRootDomain();
  if (root && h.endsWith(`.${root}`)) return true; // www., app. and other reserved names
  const configured = [process.env.NEXT_PUBLIC_APP_URL, root, ...(process.env.PLATFORM_HOSTS ?? "").split(",")]
    .map(normalizeHost)
    .filter(Boolean);
  return configured.includes(h) || configured.some((c) => h === `www.${c}`);
}

/** A hostname a reseller may claim: well-formed, not an IP, not one of ours. */
export function isClaimableDomain(domain: string): boolean {
  const d = normalizeHost(domain);
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return false;
  const root = platformRootDomain();
  if (root && (d === root || d.endsWith(`.${root}`))) return false; // use the subdomain field instead
  return !isPlatformHost(d);
}

/** A subdomain label a reseller may claim. */
export function isClaimableSubdomain(label: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/.test(label) && label.length >= 3 && !RESERVED_SUBDOMAINS.has(label);
}
