"use client";

import { useFormStatus } from "react-dom";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  email: string;
  error?: string;
  initial?: {
    full_name?: string;
    phone?: string;
    title?: string;
    organization?: string;
  };
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cl-btn-primary w-full"
    >
      {pending ? "Saving…" : "Save and continue"}
    </button>
  );
}

export function ProfileForm({ action, email, error, initial }: Props) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col">
        <label className="cl-label">Email</label>
        <input
          type="email"
          value={email}
          disabled
          className="cl-input cursor-not-allowed text-[var(--fg-subtle)]"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="full_name" className="cl-label">
          Full name <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          defaultValue={initial?.full_name ?? ""}
          placeholder="Jane Smith"
          className="cl-input"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="phone" className="cl-label">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={initial?.phone ?? ""}
          placeholder="(555) 555-1234"
          className="cl-input"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="title" className="cl-label">
          Job title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          autoComplete="organization-title"
          defaultValue={initial?.title ?? ""}
          placeholder="Safety Inspector"
          className="cl-input"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="organization" className="cl-label">
          Organization
        </label>
        <input
          id="organization"
          name="organization"
          type="text"
          autoComplete="organization"
          defaultValue={initial?.organization ?? ""}
          placeholder="Facility or firm name"
          className="cl-input"
        />
      </div>

      {error ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "rgba(168,54,43,0.4)",
            background: "rgba(168,54,43,0.08)",
            color: "#a8362b",
          }}
        >
          {error}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-xs leading-relaxed text-[var(--fg-subtle)]">
        These details show up on the inspection PDF and CAP report. You can
        edit them later.
      </p>
    </form>
  );
}
