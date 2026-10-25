import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { needsFirstRunSetup } from "@/lib/first-run";
import { oidcProviderConfigured, oidcProviderName } from "@/lib/oidc-env";
import { safeCallbackPath } from "@/lib/safe-callback-path";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  if (!(await needsFirstRunSetup())) {
    redirect("/login");
  }
  const session = await auth();
  if (session?.user) redirect("/");
  const params = await searchParams;

  const github = Boolean(
    process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
  );
  const google = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );
  const oidc = oidcProviderConfigured();
  const airGap =
    process.env.TOPOLOGY_AIR_GAP === "1" || (!github && !google && !oidc);

  return (
    <div className="topology-shell login-atmosphere relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-16 sm:px-8">
      <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
        <ThemeToggle compact />
      </div>
      <LoginForm
        oauth={{ github, google, oidc, oidcName: oidcProviderName() }}
        airGap={airGap}
        setup
        callbackUrl={safeCallbackPath(params.callbackUrl)}
      />
    </div>
  );
}
