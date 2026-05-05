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
      className="flex h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Saving..." : "Save and continue"}
    </button>
  );
}

const inputCls =
  "h-11 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600";

const labelCls = "text-sm font-medium text-zinc-900 dark:text-zinc-50";

export function ProfileForm({ action, email, error, initial }: Props) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className={labelCls}>Email</label>
        <input
          type="email"
          value={email}
          disabled
          className={`${inputCls} cursor-not-allowed text-zinc-500 dark:text-zinc-500`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="full_name" className={labelCls}>
          Full name <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          defaultValue={initial?.full_name ?? ""}
          placeholder="Jane Smith"
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="phone" className={labelCls}>
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={initial?.phone ?? ""}
          placeholder="(555) 555-1234"
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="title" className={labelCls}>
          Job title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          autoComplete="organization-title"
          defaultValue={initial?.title ?? ""}
          placeholder="Safety Inspector"
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="organization" className={labelCls}>
          Organization
        </label>
        <input
          id="organization"
          name="organization"
          type="text"
          autoComplete="organization"
          defaultValue={initial?.organization ?? ""}
          placeholder="Facility or firm name"
          className={inputCls}
        />
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <SubmitButton />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        These details show up on the inspection PDF and CAP report. You can edit them later.
      </p>
    </form>
  );
}
