import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function InspectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Samektra · Compliance Lens v2
          </span>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Inspections
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {user.email}
          </span>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            No inspections yet
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            The inspection flow is coming next. Auth and database foundation are
            ready.
          </p>
        </div>
      </main>
    </div>
  );
}
