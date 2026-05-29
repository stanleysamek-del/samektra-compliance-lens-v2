import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  // A stale/cross-browser recovery link produces "code challenge does not
  // match previously saved code verifier" (or "code verifier"/"expired").
  // That's not really a sign-in failure — the link just can't be used here, so
  // show a plain-language hint and steer the user to request a fresh one.
  const raw = (message ?? "").toLowerCase();
  const isStaleLink =
    raw.includes("code verifier") ||
    raw.includes("code challenge") ||
    raw.includes("expired") ||
    raw.includes("invalid");

  const headline = isStaleLink
    ? "This reset link can't be used"
    : message ?? "Something went wrong while signing you in.";

  return (
    <AuthLayout title="Sign-in problem">
      <div className="flex flex-col gap-4 text-center">
        <p
          className="rounded-lg border px-3 py-3 text-sm"
          style={{
            borderColor: "rgba(168,54,43,0.4)",
            background: "rgba(168,54,43,0.08)",
            color: "#a8362b",
          }}
        >
          {headline}
        </p>

        {isStaleLink ? (
          <p className="text-sm" style={{ color: "var(--muted, #6b7280)", lineHeight: 1.5 }}>
            Password-reset links work only once, expire after 1 hour, and must
            be opened in the same browser you requested them from. Request a
            fresh link below and open the newest email on this device.
          </p>
        ) : null}

        <Link
          href="/forgot-password"
          className="cl-btn-primary w-full"
        >
          {isStaleLink ? "Request a new reset link" : "Try again"}
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
        >
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
