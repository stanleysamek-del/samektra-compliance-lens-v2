"use client";

import { useId, useState } from "react";

/* =====================================================================
 *  Editorial auth inputs — underline-only, mono labels.
 *
 *  Used by the login / signup / forgot / reset forms inside <AuthLayout/>.
 *  Styles are inline so they stay scoped to the editorial shell and don't
 *  affect the dark teal app chrome. Spec source: design_handoff_compliance_lens.
 * ===================================================================== */

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono)",
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "#5f6b72",
  marginBottom: 2,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #0f1518",
  padding: "10px 0",
  fontFamily: "var(--font-jetbrains-mono)",
  fontSize: 14,
  color: "#0f1518",
  outline: "none",
  borderRadius: 0,
};

const focusOutlineCss = `
  .ed-auth-input:focus { border-bottom-color: #c89b3c !important; }
  .ed-auth-input::placeholder { color: #b9b39e; }
  .ed-auth-input:-webkit-autofill {
    -webkit-box-shadow: 0 0 0 1000px #f3efe3 inset;
    -webkit-text-fill-color: #0f1518;
    transition: background-color 9999s;
  }
`;

export function EditorialTextInput({
  label,
  name,
  type = "text",
  required,
  placeholder,
  autoComplete,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  defaultValue?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <style>{focusOutlineCss}</style>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="ed-auth-input"
        style={inputStyle}
      />
      {hint ? (
        <p
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "#5f6b72",
            fontFamily: "var(--font-jetbrains-mono)",
            letterSpacing: "0.04em",
          }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function EditorialPasswordInput({
  label,
  name,
  required,
  autoComplete,
  minLength = 8,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  defaultValue?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <style>{focusOutlineCss}</style>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          defaultValue={defaultValue}
          className="ed-auth-input"
          style={{ ...inputStyle, paddingRight: 36 }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          tabIndex={-1}
          style={{
            position: "absolute",
            top: "50%",
            right: 0,
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            padding: 6,
            cursor: "pointer",
            color: "#5f6b72",
          }}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {hint ? (
        <p
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "#5f6b72",
            fontFamily: "var(--font-jetbrains-mono)",
            letterSpacing: "0.04em",
          }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Primary submit button — black ink rectangle with gold-italic accent
 * on the "→". Matches the .btn.btn-primary recipe from the spec.
 */
export function EditorialPrimaryButton({
  children,
  pending,
  disabled,
}: {
  children: React.ReactNode;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        padding: "13px 22px",
        fontFamily: "var(--font-geist-sans)",
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: "0.01em",
        border: "1px solid #0f1518",
        background: "#0f1518",
        color: "#ece8da",
        borderRadius: 0,
        cursor: pending || disabled ? "default" : "pointer",
        opacity: pending || disabled ? 0.6 : 1,
        transition: "transform .15s ease, background .15s ease",
      }}
      onMouseEnter={(e) => {
        if (!pending && !disabled) e.currentTarget.style.background = "#1a2226";
      }}
      onMouseLeave={(e) => {
        if (!pending && !disabled) e.currentTarget.style.background = "#0f1518";
      }}
    >
      {pending ? "…" : children}
      {!pending ? (
        <span
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontStyle: "italic",
            color: "#c89b3c",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          →
        </span>
      ) : null}
    </button>
  );
}

/* ----- Helper components ----- */

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

/**
 * Inline error block — used by all auth forms when the URL has ?error=...
 */
export function EditorialErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      style={{
        marginTop: 4,
        padding: "10px 12px",
        background: "rgba(168,54,43,0.08)",
        border: "1px solid rgba(168,54,43,0.4)",
        color: "#a8362b",
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        lineHeight: 1.55,
      }}
    >
      {message}
    </p>
  );
}

/**
 * Inline success block — used by reset-password "password updated" notice.
 */
export function EditorialSuccessBanner({ message }: { message: string }) {
  return (
    <p
      style={{
        marginTop: 4,
        padding: "10px 12px",
        background: "rgba(96,122,58,0.08)",
        border: "1px solid rgba(96,122,58,0.4)",
        color: "#607a3a",
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        lineHeight: 1.55,
      }}
    >
      {message}
    </p>
  );
}

/**
 * Hairline + secondary "New here? Create an account" footer block.
 */
export function EditorialFootnote({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        aria-hidden
        style={{
          height: 1,
          background: "#0f1518",
          opacity: 0.85,
          margin: "20px 0 14px",
        }}
      />
      <p
        style={{
          textAlign: "center",
          fontSize: 13,
          color: "#5f6b72",
          fontFamily: "var(--font-geist-sans)",
          margin: 0,
        }}
      >
        {children}
      </p>
    </>
  );
}

/**
 * Mono small link — used for "Forgot password?" and similar.
 */
export function EditorialMonoLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      style={{
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        color: "#5f6b72",
        textDecoration: "none",
        borderBottom: "1px solid transparent",
        transition: "color .15s ease, border-color .15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "#b8902f";
        e.currentTarget.style.borderBottomColor = "#b8902f";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "#5f6b72";
        e.currentTarget.style.borderBottomColor = "transparent";
      }}
    >
      {children}
    </a>
  );
}

/**
 * Inline serif accent link — used inside the footnote ("Create an account").
 */
export function EditorialSerifLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      style={{
        fontFamily: "var(--font-instrument-serif)",
        fontStyle: "italic",
        fontSize: 16,
        color: "#b8902f",
        textDecoration: "none",
        borderBottom: "1px solid #b8902f",
        paddingBottom: 1,
      }}
    >
      {children}
    </a>
  );
}
