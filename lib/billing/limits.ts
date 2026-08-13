// ============================================================================
// MODULE : Plan limit & feature vocabulary (shared server ⇄ client)
// ============================================================================
//
// The server decides a tenant has run out of something, or was never sold it at
// all; the client has to say which, and offer the upgrade. Both halves therefore
// need the same names and the same "here is what you hit" shape — so those live
// here, in the one billing module that imports neither Prisma nor the database
// and can be bundled into a React component.
//
// Two refusals, deliberately kept distinct:
//
//   LIMIT   — you have this, and you have used it all up.   403 + PLAN_LIMIT
//   FEATURE — your tier does not include this at all.       403 + PLAN_FEATURE
//
// They read differently to a user ("3 of 3 businesses" versus "Knowledge base is
// a Growth feature") and they resolve differently — one can be fixed by deleting
// something, the other only by upgrading — so the UI must be able to tell them
// apart without string-matching a sentence.

export const PLAN_LIMIT_CODE = "PLAN_LIMIT";
export const PLAN_FEATURE_CODE = "PLAN_FEATURE";

// ─── Countable limits ─────────────────────────────────────────────────────────

export type LimitResource =
  | "users"
  | "contacts"
  | "campaigns"
  | "storage"
  | "ai"
  | "businesses"
  | "knowledgeDocs"
  | "messagesPerDay"
  | "messagesPerHour"
  | "campaignRecipients"
  | "templates"
  | "quickReplies"
  | "uploadSize";

/** What the tenant hit, and how far over they are. Travels on the 403 body. */
export interface LimitDetail {
  resource: LimitResource;
  used: number;
  limit: number;
  /** Display name of the plan that set the limit, e.g. "Starter". */
  planName: string;
}

/** Plain-English noun for the thing being counted, used mid-sentence. */
export const RESOURCE_LABEL: Record<LimitResource, string> = {
  users: "team members",
  contacts: "contacts",
  campaigns: "campaigns this billing period",
  storage: "MB of knowledge storage",
  ai: "AI requests this billing period",
  businesses: "businesses",
  knowledgeDocs: "knowledge base documents",
  messagesPerDay: "messages per day",
  messagesPerHour: "messages per hour",
  campaignRecipients: "recipients per campaign",
  templates: "message templates",
  quickReplies: "quick replies",
  uploadSize: "MB per file",
};

/** Headline for the upgrade dialog — a statement of what just got blocked. */
export const RESOURCE_TITLE: Record<LimitResource, string> = {
  users: "Team is full",
  contacts: "Contact limit reached",
  campaigns: "Campaign limit reached",
  storage: "Knowledge storage is full",
  ai: "AI credits used up",
  businesses: "Business limit reached",
  knowledgeDocs: "Knowledge base is full",
  messagesPerDay: "Daily message limit reached",
  messagesPerHour: "Hourly message limit reached",
  campaignRecipients: "Campaign audience too large",
  templates: "Template limit reached",
  quickReplies: "Quick reply limit reached",
  uploadSize: "File too large",
};

/**
 * The second line of the dialog. Rate and ceiling limits get different advice
 * from capacity limits: waiting fixes a per-hour cap and splitting fixes an
 * oversized campaign, so "upgrade" alone would be incomplete advice for either.
 */
export const RESOURCE_HINT: Record<LimitResource, string> = {
  users: "Upgrade to invite more agents into this workspace.",
  contacts: "Upgrade to store more contacts, or archive ones you no longer message.",
  campaigns: "Your campaign allowance resets next billing period. Upgrade to run more now.",
  storage: "Upgrade for more storage, or remove documents you no longer need.",
  ai: "Your AI credits reset next billing period. Upgrade for a larger allowance.",
  businesses:
    "Each business is a separate WhatsApp number with its own inbox, contacts and AI settings. Upgrade to run more of them from one account.",
  knowledgeDocs:
    "Upgrade to index more PDFs and documents, or delete ones your AI no longer needs.",
  messagesPerDay: "Your daily send limit resets at midnight. Upgrade to send more today.",
  messagesPerHour: "Your hourly send limit resets on the hour. Upgrade to send more now.",
  campaignRecipients:
    "Split this into smaller campaigns, or upgrade to message a larger audience in one send.",
  templates: "Upgrade to create more templates, or delete ones Meta has rejected.",
  quickReplies: "Upgrade to save more canned replies for your team.",
  uploadSize: "Upgrade to upload larger files, or split this document into smaller ones.",
};

// ─── Feature gates ────────────────────────────────────────────────────────────

/** The boolean columns on Plan that switch whole features on and off. */
export type PlanFeature =
  | "aiEnabled"
  | "ragEnabled"
  | "whiteLabel"
  | "advancedAi"
  | "allowExport";

export const FEATURE_TITLE: Record<PlanFeature, string> = {
  aiEnabled: "AI is not on your plan",
  ragEnabled: "Knowledge base is not on your plan",
  whiteLabel: "White label is not on your plan",
  advancedAi: "Advanced AI is not on your plan",
  allowExport: "Data export is not on your plan",
};

export const FEATURE_LABEL: Record<PlanFeature, string> = {
  aiEnabled: "AI auto-reply",
  ragEnabled: "Knowledge base (RAG)",
  whiteLabel: "White label",
  advancedAi: "Advanced AI (lead scoring)",
  allowExport: "CSV export",
};

export const FEATURE_HINT: Record<PlanFeature, string> = {
  aiEnabled:
    "AI drafts and sends replies to your customers automatically, in your brand's voice. Upgrade to switch it on.",
  ragEnabled:
    "Upload your PDFs and docs, and the AI answers from them instead of guessing. Upgrade to switch it on.",
  whiteLabel:
    "Replace the WhatsCRM branding with your own logo and custom domain. Upgrade to switch it on.",
  advancedAi:
    "Score and qualify every lead automatically from what the customer actually said. Upgrade to switch it on.",
  allowExport:
    "Download your contacts, leads and campaign results as CSV to use anywhere else. Upgrade to switch it on.",
};

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Refused because the plan said so.
 *
 * One class for both sides of the wire: the API throws it and serialises it with
 * `limitErrorBody`, the client rebuilds it from the response with `upgradeFrom`.
 * That symmetry is what lets a component `catch` and get back the same typed
 * object the route threw, rather than a message it has to parse.
 */
export class LimitError extends Error {
  readonly detail: LimitDetail;

  constructor(detail: LimitDetail, message: string) {
    super(message);
    this.name = "LimitError";
    this.detail = detail;
  }
}

/** Refused because the tier does not include the feature at all. */
export class FeatureError extends Error {
  readonly feature: PlanFeature;
  readonly planName: string;

  constructor(feature: PlanFeature, planName: string, message: string) {
    super(message);
    this.name = "FeatureError";
    this.feature = feature;
    this.planName = planName;
  }
}

// ─── What the upgrade dialog renders ──────────────────────────────────────────

/** Either refusal, in the shape the dialog consumes. */
export type UpgradeReason =
  | ({ kind: "limit" } & LimitDetail)
  | { kind: "feature"; feature: PlanFeature; planName: string };

/** Narrow a caught error to something the dialog can show, or null if it is not ours. */
export function upgradeReasonOf(error: unknown): UpgradeReason | null {
  if (error instanceof LimitError) return { kind: "limit", ...error.detail };
  if (error instanceof FeatureError) {
    return { kind: "feature", feature: error.feature, planName: error.planName };
  }
  return null;
}

// ─── Wire format ──────────────────────────────────────────────────────────────

export function limitErrorBody(error: LimitError) {
  return {
    success: false as const,
    error: error.message,
    code: PLAN_LIMIT_CODE,
    limit: error.detail,
  };
}

export function featureErrorBody(error: FeatureError) {
  return {
    success: false as const,
    error: error.message,
    code: PLAN_FEATURE_CODE,
    feature: error.feature,
    planName: error.planName,
  };
}

/**
 * Rebuild the thrown error from a failed response body, or null if this was an
 * ordinary failure. Every field is re-validated rather than trusted: the caller
 * hands us whatever `res.json()` produced, which on a proxy error page or an
 * HTML 502 is not the shape we wrote.
 */
export function apiErrorFrom(json: unknown): LimitError | FeatureError | null {
  if (!json || typeof json !== "object") return null;

  const body = json as {
    code?: unknown;
    error?: unknown;
    limit?: unknown;
    feature?: unknown;
    planName?: unknown;
  };
  const message = typeof body.error === "string" ? body.error : null;

  if (body.code === PLAN_LIMIT_CODE) {
    const detail = body.limit as Partial<LimitDetail> | undefined;
    if (!detail || typeof detail.resource !== "string") return null;
    if (!(detail.resource in RESOURCE_LABEL)) return null;

    return new LimitError(
      {
        resource: detail.resource as LimitResource,
        used: Number(detail.used ?? 0),
        limit: Number(detail.limit ?? 0),
        planName: typeof detail.planName === "string" ? detail.planName : "your plan",
      },
      message ?? "You've reached a limit on your plan.",
    );
  }

  if (body.code === PLAN_FEATURE_CODE) {
    if (typeof body.feature !== "string") return null;
    if (!(body.feature in FEATURE_LABEL)) return null;

    return new FeatureError(
      body.feature as PlanFeature,
      typeof body.planName === "string" ? body.planName : "your plan",
      message ?? "This feature is not included in your plan.",
    );
  }

  return null;
}

/**
 * Throw the right error type for a failed JSON response — a LimitError or
 * FeatureError when the body carries one, otherwise a plain Error with the
 * server's message. Callers in hooks use this so a `catch` can tell "show the
 * upgrade dialog" from "show the red text under the field".
 */
export function throwApiError(json: unknown, fallback: string): never {
  const typed = apiErrorFrom(json);
  if (typed) throw typed;

  const message = (json as { error?: unknown } | null)?.error;
  throw new Error(typeof message === "string" ? message : fallback);
}
