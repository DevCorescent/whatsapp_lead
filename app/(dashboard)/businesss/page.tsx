import { redirect } from "next/navigation";

/** Typo redirect — logs showed GET /businesss → 404. */
export default function BusinesssTypoRedirectPage() {
  redirect("/businesses");
}
