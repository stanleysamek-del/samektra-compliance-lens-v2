"use client";

import { useId, useState } from "react";

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
          {show ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint ? (
        <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}
