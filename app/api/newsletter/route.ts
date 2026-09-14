// ROUTE : /api/newsletter
//   POST — add an address to the newsletter list from the homepage form. Public.
//
// The only public write the CMS introduces, so it is kept narrow:
//   • one field, validated as an email and lower-cased;
//   • a honeypot — the form renders a hidden `website` input a person never
//     fills, and a request that fills it is answered as a success and dropped;
//   • the same response for a new and an already-subscribed address, so the
//     endpoint cannot be used to check whether someone is on the list.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.email("Enter a valid email address").max(254),
  website: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  if (parsed.data.website) {
    return NextResponse.json({ success: true });
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      update: {},
      create: { email, source: "homepage" },
    });
  } catch (error) {
    console.error("[NEWSLETTER] Failed to store subscriber:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't subscribe you right now. Please try again later." },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}
