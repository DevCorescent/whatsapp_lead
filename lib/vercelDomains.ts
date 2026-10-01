// ============================================================================
// MODULE : Custom domains on Vercel (optional)
//
// A white-label domain only serves this app once it is added to the Vercel
// project (which also issues its SSL certificate) and its DNS points at Vercel.
// With VERCEL_API_TOKEN and VERCEL_PROJECT_ID set (VERCEL_TEAM_ID for team
// projects), saving a domain adds it automatically; without them the super admin
// adds it in the Vercel dashboard. Best-effort: a failure here never blocks
// saving the branding — the result is reported back so the UI can say what's left.
// ============================================================================

export interface DomainResult {
  status: "added" | "manual" | "error";
  message: string;
}

export async function attachDomain(domain: string): Promise<DomainResult> {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  const dnsHint = `Point a CNAME record for ${domain} to cname.vercel-dns.com.`;
  if (!token || !project) {
    return { status: "manual", message: `Add ${domain} to the Vercel project, then ${dnsHint.toLowerCase()}` };
  }

  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  try {
    const res = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/domains${team}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
    });
    if (res.ok) return { status: "added", message: `Domain added. ${dnsHint}` };
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    if (body.error?.code === "domain_already_in_use" || body.error?.code === "domain_already_exists") {
      return { status: "added", message: `Domain already on the project. ${dnsHint}` };
    }
    return { status: "error", message: body.error?.message ?? `Vercel returned ${res.status}` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not reach Vercel" };
  }
}

// ─── Is it connected? ─────────────────────────────────────────────────────────

export interface DomainCheck {
  /** connected: serving this app · pending: DNS (or ownership) not set yet · not_added: not on the Vercel project */
  state: "connected" | "pending" | "not_added" | "error";
  message: string;
  /** The DNS record the domain owner still has to add, when one is missing. */
  record?: { type: "CNAME" | "A" | "TXT"; name: string; value: string };
}

const CNAME_TARGET = process.env.NEXT_PUBLIC_CNAME_TARGET || "cname.vercel-dns.com";
const APEX_IP = "76.76.21.21";
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "ac", "edu", "gen", "firm", "ind"]);

/** "edureach.com" / "edureach.co.in" are apex domains (A record); "crm.edureach.com" is not (CNAME). */
function isApex(domain: string): boolean {
  const labels = domain.split(".");
  if (labels.length <= 2) return true;
  return labels.length === 3 && labels[2].length === 2 && SECOND_LEVEL.has(labels[1]);
}

function pointingRecord(domain: string): DomainCheck["record"] {
  return isApex(domain)
    ? { type: "A", name: "@", value: APEX_IP }
    : { type: "CNAME", name: domain.split(".")[0], value: CNAME_TARGET };
}

/** Vercel's anycast ranges for apex (A record) domains. */
const VERCEL_IP_PREFIXES = ["76.76.21.", "66.33.60.", "216.198.79."];

/**
 * DNS-only check, used when the Vercel API isn't configured. Asks public resolvers
 * (fresher than the host's cache, and reachable where the host's own DNS server
 * refuses direct queries), falling back to the OS resolver for A records.
 */
async function dnsPointsHere(domain: string): Promise<boolean> {
  const dns = await import("node:dns/promises");
  const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);

  const cnames = await resolver.resolveCname(domain).catch(() => [] as string[]);
  if (cnames.some((c) => /(^|\.)vercel-dns\.com\.?$/.test(c) || c.replace(/\.$/, "") === CNAME_TARGET)) return true;

  let ips = await resolver.resolve4(domain).catch(() => [] as string[]);
  if (ips.length === 0) ips = (await dns.lookup(domain, { all: true, family: 4 }).catch(() => [])).map((a) => a.address);
  return ips.some((ip) => VERCEL_IP_PREFIXES.some((p) => ip.startsWith(p)));
}

export async function checkDomain(domain: string): Promise<DomainCheck> {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  const record = pointingRecord(domain);

  if (!token || !project) {
    return (await dnsPointsHere(domain))
      ? { state: "connected", message: "DNS points to the platform. If the site doesn't open yet, ask support to finish adding the domain." }
      : { state: "pending", message: "DNS doesn't point to the platform yet. Add the record below at your domain provider.", record };
  }

  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}${team}`,
      { headers, cache: "no-store" },
    );
    if (res.status === 404) return { state: "not_added", message: "The domain isn't on the platform yet. Save the branding again, or ask support to add it." };
    if (!res.ok) return { state: "error", message: `Couldn't check the domain (Vercel returned ${res.status}).` };
    const info = (await res.json()) as { verified?: boolean; verification?: { type: string; domain: string; value: string }[] };

    // Domain already used by another Vercel account: prove ownership with a TXT record first.
    const txt = info.verification?.find((v) => v.type === "TXT");
    if (info.verified === false && txt) {
      return {
        state: "pending",
        message: "Prove you own the domain: add this TXT record at your domain provider.",
        record: { type: "TXT", name: txt.domain, value: txt.value },
      };
    }

    const cfgRes = await fetch(`https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config${team}`, { headers, cache: "no-store" });
    const cfg = (await cfgRes.json().catch(() => ({}))) as { misconfigured?: boolean };
    if (cfg.misconfigured) {
      return { state: "pending", message: "DNS doesn't point to the platform yet. Add the record below at your domain provider.", record };
    }
    return { state: "connected", message: "Connected. Your site and login page are live on this domain." };
  } catch (error) {
    return { state: "error", message: error instanceof Error ? error.message : "Could not reach Vercel" };
  }
}
