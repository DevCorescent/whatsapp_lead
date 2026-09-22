"use client";

import { WhatsAppConnectCard } from "@/components/settings/WhatsAppConnectCard";

/**
 * Settings → WhatsApp.
 *
 * Connecting a number is Meta's Embedded Signup and nothing else. The customer
 * presses one button, completes Meta's own dialog, and the server derives the
 * WABA, the phone number and a customer-scoped access token from Meta directly —
 * see /api/integrations/whatsapp/connect.
 *
 * There is deliberately no credential form here any more. Every field it used to
 * ask for is a value Embedded Signup returns:
 *
 *   Phone Number ID      → GET /<WABA_ID>/phone_numbers
 *   WhatsApp Business ID → GET /debug_token, granular_scopes[].target_ids
 *   Access token         → GET /oauth/access_token
 *
 * The remaining two were never the customer's to supply. The App Secret belongs to
 * this deployment's Meta app, not to the customer's, and lives server-side in
 * WHATSAPP_APP_SECRET; the webhook verify token is used once by the operator when
 * registering the single callback URL. Embedded Signup subscribes each customer's
 * WABA to that same app, so their events arrive at that one URL without the
 * customer configuring a webhook at all.
 *
 * Asking a customer to find and paste any of it was work whose only product was a
 * way to get it wrong — a Phone Number ID in the WABA field, a token from a
 * different app, an App Secret pasted into a form that then had to store it.
 */
export function WhatsAppTab() {
  return (
    <div className="space-y-5">
      <WhatsAppConnectCard />
    </div>
  );
}
