"use client";

import { useFormStatus } from "react-dom";
import {
  EditorialPasswordInput,
  EditorialPrimaryButton,
  EditorialErrorBanner,
} from "@/components/auth-editorial-inputs";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <EditorialPrimaryButton pending={pending}>
      {pending ? "Updating" : "Update password"}
    </EditorialPrimaryButton>
  );
}

export function ResetPasswordForm({ action, error }: Props) {
  return (
    <form
      action={action}
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <EditorialPasswordInput
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Minimum 8 characters."
      />
      <EditorialPasswordInput
        label="Confirm new password"
        name="confirm_password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      {error ? <EditorialErrorBanner message={error} /> : null}
      <SubmitButton />
    </form>
  );
}
