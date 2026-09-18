import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm, safeCallbackPath } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const params = await searchParams;

  const github = Boolean(
    process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
  );
  const google = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );
  const airGap = process.env.TOPOLOGY_AIR_GAP === "1" || (!github && !google);

  return (
    <div className="topology-shell login-atmosphere relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-16 sm:px-8">
      <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
        <ThemeToggle compact />
      </div>
      <LoginForm
        oauth={{ github, google }}
        airGap={airGap}
        callbackUrl={safeCallbackPath(params.callbackUrl)}
      />
    </div>
  );
}
