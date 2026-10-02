"use client";

import { useId, useState } from "react";

import { Eye, EyeOff } from "lucide-react";
type Props = {
  label: string;
  name: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  defaultValue?: string;
  hint?: string;
};

export function PasswordInput({
  label,
  name,
  required,
  autoComplete,
  minLength = 8,
  defaultValue,
  hint,
}: Props) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="cl-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          defaultValue={defaultValue}
          className="cl-input pr-12"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
        >
          {show ? <EyeOff size={20} strokeWidth={1.8} aria-hidden /> : <Eye size={20} strokeWidth={1.8} aria-hidden />}
        </button>
      </div>
      {hint ? (
        <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}
