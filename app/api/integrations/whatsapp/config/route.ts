// ============================================================================
// ROUTE  : /api/integrations/whatsapp/config
// GET    - Non-secret Embedded Signup configuration for the browser.
//
// ACCESS - Authenticated members of a tenant. The values are public by
//          construction (the Facebook JS SDK puts both in the page), but there is
//          no reason to hand a deployment's app id to anonymous visitors.
//
// This exists instead of NEXT_PUBLIC_* variables so that the app id, the config
// id and the Graph version are read at request time from the same WHATSAPP_*
// variables the server already uses. A NEXT_PUBLIC_ duplicate would be inlined at
// build time, need a rebuild to change, and give an operator two names for one
// value — the second of which is easy to set to the app *secret* by mistake.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { missingEmbeddedSignupEnv, readEmbeddedSignupConfig } from "@/lib/whatsappEmbeddedSignup";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = readEmbeddedSignupConfig();
  const missing = missingEmbeddedSignupEnv();

  // A deployment without the variables is not an error — it is an instance where the
  // operator has not finished Meta app setup. The UI keeps manual entry available and
  // says which variables are missing, which is more useful than a 500.
  if (!config || missing.length > 0) {
    return NextResponse.json({
      success: true,
      data: { enabled: false, missing },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      enabled: true,
      appId: config.appId,
      configId: config.configId,
      graphVersion: config.graphVersion,
      missing: [] as string[],
    },
  });
}
