"use client";

// Opening Razorpay's checkout from the browser. The order is created by the
// server; this only shows the payment window and hands the result back.

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

export interface RazorpayResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the payment window"));
    document.head.appendChild(script);
  });
}

/** Resolves with the payment result, or null if the user closed the window. */
export async function openRazorpay(opts: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  color?: string;
}): Promise<RazorpayResult | null> {
  await loadScript();
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amount,
      currency: opts.currency,
      name: opts.name,
      description: opts.description,
      theme: { color: opts.color ?? "#059669" },
      handler: (response: RazorpayResult) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.open();
  });
}
