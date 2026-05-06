import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <AuthLayout title="Sign-in problem">
      <div className="flex flex-col gap-4 text-center">
        <p
          className="rounded-lg border px-3 py-3 text-sm"
          style={{
            borderColor: "rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
          }}
        >
          {message ?? "Something went wrong while signing you in."}
        </p>
        <Link href="/login" className="cl-btn-primary w-full">
          Try again
        </Link>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
        >
          Reset your password instead
        </Link>
      </div>
    </AuthLayout>
  );
}
