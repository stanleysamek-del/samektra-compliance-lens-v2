import { requestPasswordReset } from "./actions";
import { ForgotPasswordForm } from "./forgot-form";
import { AuthLayout } from "@/components/auth-layout";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthLayout
      eyebrow="§ 09 — Recovery"
      title="Reset your password."
      subtitle="Enter your email and we'll send you a reset link."
    >
      <ForgotPasswordForm
        action={requestPasswordReset}
        error={params.error}
        sent={params.sent === "1"}
      />
    </AuthLayout>
  );
}
