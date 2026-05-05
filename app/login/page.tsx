import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendMagicLink } from "./actions";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  if (user) {
    redirect(params.next ?? "/inspections");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Samektra
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Compliance Lens v2
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Sign in with a magic link sent to your email.
          </p>
        </div>

        <LoginForm
          action={sendMagicLink}
          next={params.next}
          sent={params.sent === "1"}
          error={params.error}
        />
      </div>
    </div>
  );
}
