import { redirect } from "next/navigation";

export default function ConnectRedirectPage() {
  redirect("/settings?section=connections");
}
