import Link from "next/link";
export default function DemoPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12">
      <Link href="/" className="underline">
        Compliance Lens
      </Link>
      <h1 className="text-3xl font-semibold">Try an inspection workflow</h1>
      <p>
        This guided example is free. It uses a prepared scenario, not a live AI
        model. No account or payment required.
      </p>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">
          Scenario: boxes obstruct an exit route
        </h2>
        <p>
          Record the location, capture evidence, assign the correction, and
          verify that the route is clear.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>Location: ground floor, east corridor.</li>
          <li>
            Finding: stored materials obstruct the exit route. Confirm
            conditions and the applicable adopted code before issuing the
            finding.
          </li>
          <li>
            Corrective action: remove stored items and maintain the required
            clear route.
          </li>
          <li>Assign an owner and due date; attach a follow-up photo.</li>
          <li>
            Inspector verifies the correction and includes the evidence in the
            report.
          </li>
        </ol>
      </section>
      <p>
        Free accounts can capture photos, complete checklists, manage findings,
        and export reports. Paid plans add metered AI drafting and coaching;
        higher plans add advanced review. Inspectors remain responsible for
        verifying the evidence.
      </p>
      <div className="flex gap-4">
        <Link href="/signup" className="cl-btn-primary">
          Start a free inspection
        </Link>
        <Link href="/#pricing" className="cl-btn-outline">
          Compare plans
        </Link>
      </div>
    </main>
  );
}
