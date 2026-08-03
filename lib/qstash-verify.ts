// ============================================================================
// MODULE : QStash signature verification
// ============================================================================
//
// Worker routes are ordinary public HTTP endpoints — QStash reaches them the same
// way anyone else on the internet can. They are also the routes that send WhatsApp
// messages, call the model and move campaign counters, so without a check here an
// unauthenticated caller could drive all three by POSTing a hand-written job body.
//
// This is therefore the authentication boundary of the whole worker tier, and it
// plays the same role for QStash that `verifySignature` plays for Meta in the
// WhatsApp webhook: it must run before the body is interpreted, and it must fail
// closed. Every worker calls it as its first statement and answers 401 on false.

import { Receiver } from "@upstash/qstash";
import { NextRequest } from "next/server";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

/**
 * Verify that this request was sent by QStash, not an external caller.
 * Returns true if valid. Returns false if the signature is missing or wrong.
 * Worker routes must return 401 when this returns false.
 *
 * The digest is computed over the exact bytes QStash signed, which is why the body
 * is read as raw text rather than re-serialised from a parsed object. It is read
 * from `req.clone()` specifically: a request body is a single-use stream, so
 * consuming `req` itself here would leave nothing for the worker's own
 * `req.json()` and every worker would fail with "Body is unusable" on its second
 * line. The clone keeps this function a pure precondition — callers use `req`
 * afterwards exactly as if it had never been touched.
 *
 * `receiver.verify` throws on a bad signature rather than returning false, and it
 * is checked against both the current and next signing keys internally so a key
 * rotation does not reject in-flight jobs.
 */
export async function verifyQStashSignature(req: NextRequest): Promise<boolean> {
  const currentKeySet = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY);
  const nextKeySet = Boolean(process.env.QSTASH_NEXT_SIGNING_KEY);

  if (!currentKeySet || !nextKeySet) {
    console.error("[QSTASH-VERIFY] Signing keys not configured", {
      QSTASH_CURRENT_SIGNING_KEY: currentKeySet,
      QSTASH_NEXT_SIGNING_KEY: nextKeySet,
    });
    return false;
  }

  try {
    const signature = req.headers.get("upstash-signature");
    if (!signature) {
      console.warn("[QSTASH-VERIFY] Missing upstash-signature header — rejecting");
      return false;
    }
    const body = await req.clone().text();
    await receiver.verify({ signature, body });
    console.log("[QSTASH-VERIFY] Signature valid");
    return true;
  } catch (error) {
    console.error("[QSTASH-VERIFY] Signature verification failed", { error: String(error) });
    return false;
  }
}
