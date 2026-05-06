import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { setNewPassword } from "./actions";
import { ResetPasswordForm } from "./reset-form";
import { AuthLayout } from "@/components/auth-layout";

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
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a new password for your account."
    >
      {user ? (
        <ResetPasswordForm action={setNewPassword} error={params.error} />
      ) : (
        <div
          className="rounded-lg border px-4 py-4 text-sm"
          style={{
            borderColor: "rgba(245,158,11,0.3)",
            background: "rgba(245,158,11,0.08)",
            color: "#fde68a",
          }}
        >
          <p className="font-medium text-[var(--fg)]">
            This reset link is no longer valid.
          </p>
          <p className="mt-1.5 text-[var(--fg-muted)]">
            The link may have expired or already been used. Request a fresh
            one.
          </p>
          <Link
            href="/forgot-password"
            className="mt-3 inline-block font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
          >
            Request a new reset link →
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
