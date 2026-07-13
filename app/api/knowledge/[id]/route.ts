// TODO [GAURANSH]: Single knowledge doc operations.
//
// GET /api/knowledge/[id]  → doc details + chunk preview
// DELETE /api/knowledge/[id]
//   - Delete vectors from Pinecone (filter by docId)
//   - Delete DB record

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Delete from Pinecone + DB
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
