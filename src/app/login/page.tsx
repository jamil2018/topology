import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="topology-shell flex min-h-screen items-center justify-center px-4 py-12">
      <LoginForm
        oauth={{
          github: Boolean(
            process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
          ),
          google: Boolean(
            process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
          ),
        }}
      />
    </div>
  );
}
