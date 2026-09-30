// ============================================================================
// ROUTE : /api/admin/tenants/[id]/wallet   (SUPER_ADMIN only)
//
// GET  - The account's balance and latest transactions.
// POST - Manual credit or correction { amountMinor (+ adds, − removes), note } —
//        e.g. a top-up paid by bank transfer. Never takes the balance below zero.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adjust, getWallet, WalletError } from "@/lib/wallet";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  amountMinor: z.number().int().refine((v) => v !== 0, "Enter an amount").refine((v) => Math.abs(v) <= 50_000_000, "Too large"),
  note: z.string().trim().min(1, "Add a note (e.g. bank transfer reference)").max(200),
});

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPER_ADMIN") return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await superAdmin();
  if (error) return error;
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });

  const [wallet, transactions] = await Promise.all([
    getWallet(id),
    prisma.walletTransaction.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return NextResponse.json({ success: true, data: { balanceMinor: wallet.balanceMinor, transactions } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await superAdmin();
  if (error) return error;
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const result = await adjust(id, parsed.data.amountMinor, {
      description: parsed.data.note,
      createdById: session!.user.id,
      idempotencyKey: `adjust:${randomUUID()}`,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session!.user.tenantId,
        userId: session!.user.id,
        action: "WALLET_ADJUSTED",
        resource: "wallet",
        resourceId: id,
        metadata: { amountMinor: parsed.data.amountMinor, note: parsed.data.note },
      },
    });
    return NextResponse.json({ success: true, data: { balanceMinor: result.balanceAfterMinor } });
  } catch (e) {
    if (e instanceof WalletError) return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    throw e;
  }
}
