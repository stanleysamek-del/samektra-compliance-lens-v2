import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { setNewPassword } from "./actions";
import { ResetPasswordForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const params = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Samektra
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Set a new password
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Choose a new password for your account.
          </p>
        </div>

        {user ? (
          <ResetPasswordForm action={setNewPassword} error={params.error} />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-medium">This reset link is no longer valid.</p>
            <p className="mt-1">
              The link may have expired or already been used. Request a fresh one.
            </p>
            <Link
              href="/forgot-password"
              className="mt-3 inline-block font-medium underline underline-offset-4"
            >
              Request a new reset link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
