/**
 * One JSON fetch for the knowledge-base screens.
 *
 * Every one of these endpoints answers with `{ success, data, error }`, and the
 * FAQ editor needs the server's `error` string rather than a status code — "not
 * enough text in this document" is the whole message the user should see. Written
 * once so no call site has to remember to dig it out.
 */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json;
}
