import { redirect } from "next/navigation";

/** Common typo / short path → canonical multi-business settings page. */
export default function BusinessRedirectPage() {
  redirect("/businesses");
}
