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
      className="flex h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Updating..." : "Update password"}
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
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
