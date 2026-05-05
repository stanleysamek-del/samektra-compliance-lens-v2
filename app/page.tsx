import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/inspections");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-8 py-24">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Samektra
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Compliance Lens v2
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            AI-powered code compliance inspection — NFPA, IBC, IFC, NEC, CMS, The Joint
            Commission, ADA, ANSI, Georgia Title 25. Walk through the building, snap photos,
            generate the full inspection deliverable: CAP, LSRA, ILSM, and a signed PDF report.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="flex h-11 items-center justify-center rounded-md bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="flex h-11 items-center justify-center rounded-md border border-zinc-200 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Sign in
          </Link>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Staging build
          </h2>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            This is the v2 staging environment. Features are wired up incrementally and the live
            production app is unaffected.
          </p>
        </div>
      </main>
    </div>
  );
}
