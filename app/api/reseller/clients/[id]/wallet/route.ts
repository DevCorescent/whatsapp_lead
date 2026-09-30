// ============================================================================
// ROUTE : POST /api/reseller/clients/[id]/wallet
//
// A reseller moves credit from its own wallet to a client it manages
// { amountMinor, note? }. Reseller accounts only; reseller.clients.manage and
// billing.manage. Recorded on both statements (TRANSFER_OUT / TRANSFER_IN).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findManagedClient, getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { transfer, WalletError } from "@/lib/wallet";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  amountMinor: z.number().int().min(100, "Minimum transfer is ₹1").max(50_000_000),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied =
    (await requirePermission(scope, "reseller.clients.manage")) ?? (await requirePermission(scope, "billing.manage"));
  if (denied) return denied;
  const { id } = await params;

  const client = await findManagedClient(scope!.tenantId, id);
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const result = await transfer(scope!.tenantId, client.id, parsed.data.amountMinor, {
      description: parsed.data.note || `Credit from ${scope!.tenantName}`,
      createdById: scope!.userId,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: scope!.tenantId,
        userId: scope!.userId,
        action: "WALLET_TRANSFER",
        resource: "wallet",
        resourceId: client.id,
        metadata: { amountMinor: parsed.data.amountMinor, note: parsed.data.note ?? null },
      },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof WalletError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[RESELLER WALLET TRANSFER]", error);
    return NextResponse.json({ success: false, error: "Transfer failed" }, { status: 500 });
  }
}
