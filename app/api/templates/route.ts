// ============================================================================
// OWNER  : Gauransh
// MODULE : Support
// ROUTE  : /api/templates
//
// METHODS
// GET    - List the authenticated tenant's message templates, newest first
// POST   - Save a message template
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId.
// POST   - Authenticated. Same scoping; template names are unique per tenant, so a
//          name taken in another workspace does not collide with this one.
// ============================================================================
//
// This route persists templates. It does not submit them to Meta.
//
// That distinction matters and is not an omission: `MessageTemplate.status` defaults to "PENDING" and
// nothing here advances it, so a template saved through this endpoint will never reach APPROVED and
// therefore cannot be sent by a campaign — Meta only accepts templates it has itself approved.
// Submission is a separate flow against the WhatsApp Business Management API, and building it here
// would put a network call to Meta inside a create that is otherwise a single local write. Until that
// flow exists, this endpoint is a drafting surface.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Columns the template list renders.
 *
 * `waTemplateId` is included because it is the only signal of whether a template has ever been
 * registered with Meta — null means it exists only here — and an operator debugging why a campaign
 * will not send needs to see that without opening the database.
 */
const TEMPLATE_SELECT = {
  id: true,
  name: true,
  category: true,
  language: true,
  headerType: true,
  headerContent: true,
  body: true,
  footer: true,
  buttons: true,
  variables: true,
  status: true,
  waTemplateId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MessageTemplateSelect;

/**
 * The body of a template being saved.
 *
 * `strictObject` because the writable surface must be enforced rather than documented. `status` and
 * `waTemplateId` are absent by design: both describe Meta's opinion of the template, not the
 * tenant's. A client able to set `status: "APPROVED"` could hand a campaign a template Meta has never
 * seen, and every message it sent would be rejected at the API — with the campaign reporting the
 * failure as ours.
 *
 * `buttons` is `Json?` in the schema and is accepted as an opaque object: its shape is Meta's to
 * define, and mirroring their component grammar in Zod would fork a spec we do not own.
 */
const createTemplateSchema = z.strictObject({
  name: z.string().trim().min(1, "Template name is required"),
  category: z.string().trim().min(1, "Category is required"),
  language: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1, "Template body is required"),
  footer: z.string().trim().min(1).optional(),
  buttons: z.record(z.string(), z.unknown()).optional(),
  variables: z.array(z.string().min(1)).optional(),
  headerType: z.string().trim().min(1).optional(),
  headerContent: z.string().trim().min(1).optional(),
});

type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

/**
 * List the tenant's templates, newest first.
 *
 * `tenantId` is the only predicate, and it comes from the session — there is no input a caller could
 * supply to widen it. The `@@unique([name, tenantId])` constraint doubles as the index this read
 * walks, so the tenant's templates are found rather than scanned for.
 */
async function listTemplates(tenantId: string) {
  return prisma.messageTemplate.findMany({
    where: { tenantId },
    select: TEMPLATE_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Save a template.
 *
 * A single create, so no transaction: one statement is already atomic, and wrapping it would pin a
 * connection to express a guarantee Postgres gives for free.
 *
 * Uniqueness is delegated to `@@unique([name, tenantId])` rather than checked with a pre-flight read.
 * That is not a shortcut — a read-then-write cannot be made race-safe: two concurrent requests for the
 * same name would both find nothing and both proceed, and one would fail at the constraint anyway. The
 * constraint is the check; the P2002 handler at the call site is how it is reported.
 *
 * The composite key is `(name, tenantId)`, so a name another workspace has taken does not collide here
 * — tenants do not share a template namespace.
 *
 * `language`, `status` and `variables` are left to the schema's defaults when absent. Restating them
 * would duplicate the schema's intent and drift from it the first time a default changes.
 */
async function createTemplate(tenantId: string, input: CreateTemplateInput) {
  return prisma.messageTemplate.create({
    data: {
      tenantId,
      name: input.name,
      category: input.category,
      language: input.language,
      body: input.body,
      footer: input.footer,
      // `buttons` is a Json column; the validated object is a plain record and is handed to Prisma as
      // one. The cast reconciles Zod's `unknown` values with Prisma's Json input type — it widens
      // nothing and admits no `any`.
      buttons: input.buttons as Prisma.InputJsonObject | undefined,
      variables: input.variables,
      headerType: input.headerType,
      headerContent: input.headerContent,
    },
    select: TEMPLATE_SELECT,
  });
}

/**
 * Return the tenant's templates.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const templates = await listTemplates(tenantId);

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the read failed.
    console.error("[TEMPLATES]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load templates" },
      { status: 500 }
    );
  }
}

/**
 * Save a template.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const parsed = createTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const template = await createTemplate(tenantId, parsed.data);

    return NextResponse.json(
      { success: true, data: template },
      { status: 201 }
    );
  } catch (error) {
    // P2002 on `@@unique([name, tenantId])` means this workspace already has a template by this name.
    // A duplicate is a conflict the caller can act on — rename or edit the existing one — not a server
    // fault, and the database is what makes the answer authoritative under concurrency.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "A template with this name already exists",
        },
        { status: 409 }
      );
    }

    console.error("[TEMPLATES]", error);

    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 }
    );
  }
}
