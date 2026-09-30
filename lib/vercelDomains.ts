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
