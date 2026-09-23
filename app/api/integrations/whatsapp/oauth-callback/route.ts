import { NextRequest } from "next/server";

// ============================================================================
// GET /api/integrations/whatsapp/oauth-callback
//
// Facebook redirects here after the Embedded Signup popup completes. We serve
// a tiny HTML page that forwards the code (or error) back to the opener via
// postMessage, then closes the popup.
//
// This approach lets us use a deterministic redirect_uri that we control on
// both sides: the popup URL and the server-side code exchange both use this
// route's URL, so they always match and error_subcode 36008 cannot occur.
// ============================================================================

export function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const error = req.nextUrl.searchParams.get("error") ?? "";
  const errorDescription = req.nextUrl.searchParams.get("error_description") ?? "";

  // JSON.stringify is used so the values are safely embedded as JS string
  // literals — the code is an opaque token that may contain characters that
  // would break a naive template string.
  const payload = JSON.stringify({ type: "WA_OAUTH_CALLBACK", code, error, errorDescription });

  const html = `<!DOCTYPE html>
<html>
<head><title>Connecting WhatsApp…</title></head>
<body>
<script>
(function () {
  var p = ${payload};
  if (window.opener && typeof window.opener.postMessage === "function") {
    window.opener.postMessage(p, window.location.origin);
  }
  window.close();
}());
</script>
<p style="font-family:sans-serif;text-align:center;margin-top:3rem;color:#555">
  Connecting your WhatsApp account…
</p>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
