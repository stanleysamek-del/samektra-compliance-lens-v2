"use client";

import { useFormStatus } from "react-dom";
import { PasswordInput } from "@/components/password-input";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cl-btn-primary w-full"
    >
      {pending ? "Updating…" : "Update password"}
    </button>
  );
}

export function ResetPasswordForm({ action, error }: Props) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <PasswordInput
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Minimum 8 characters."
      />
      <PasswordInput
        label="Confirm new password"
        name="confirm_password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      {error ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
          }}
        >
          {error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
