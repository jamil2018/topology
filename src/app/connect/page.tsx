import { redirect } from "next/navigation";

export default function ConnectRedirectPage() {
  // Keep the legacy section id — server redirects drop URL hashes, and the
  // Settings client canonicalizes `connections` → integrations#connections.
  redirect("/settings?section=connections");
}
