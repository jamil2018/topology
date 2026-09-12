import { redirect } from "next/navigation";

export default function AutomationRedirectPage() {
  redirect("/settings?section=ci");
}
