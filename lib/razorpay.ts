import Razorpay from "razorpay";
import crypto from "crypto";

let client: Razorpay | null = null;

export class RazorpayNotConfiguredError extends Error {
  constructor() {
    super("Billing is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable payments.");
    this.name = "RazorpayNotConfiguredError";
  }
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpay(): Razorpay {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new RazorpayNotConfiguredError();
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

/**
 * Verify Razorpay payment signature.
 * Signature = HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET).
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!process.env.RAZORPAY_KEY_SECRET) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/** Absolute base URL for redirect URLs. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
