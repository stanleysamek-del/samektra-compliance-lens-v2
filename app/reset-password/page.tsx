import { getUserOrNullFast } from "@/lib/supabase/get-user-fast";
import { setNewPassword } from "./actions";
import { ResetPasswordForm } from "./reset-form";
import { AuthLayout } from "@/components/auth-layout";
import {
  EditorialSerifLink,
  EditorialFootnote,
} from "@/components/auth-editorial-inputs";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // If Supabase is slow we render the "link no longer valid" state rather
  // than time the whole page out. A retry will succeed once Supabase is up.
  const user = await getUserOrNullFast();
  const params = await searchParams;

  return (
    <AuthLayout
      eyebrow="§ 09 — New password"
      title="Set a new password."
      subtitle="Choose a new password for your account."
    >
      {user ? (
        <ResetPasswordForm action={setNewPassword} error={params.error} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: "12px 14px",
              border: "1px solid rgba(168,118,42,0.5)",
              background: "rgba(168,118,42,0.08)",
              color: "#a8762a",
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              lineHeight: 1.55,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              This reset link is no longer valid.
            </p>
            <p style={{ marginTop: 6, marginBottom: 0 }}>
              The link may have expired or already been used. Request a fresh
              one.
            </p>
          </div>
          <EditorialFootnote>
            <EditorialSerifLink href="/forgot-password">
              Request a new reset link
            </EditorialSerifLink>
          </EditorialFootnote>
        </div>
      )}
    </AuthLayout>
  );
}
