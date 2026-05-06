export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <pre style={{ padding: 24, color: "#fff", background: "#000", fontFamily: "monospace" }}>
      {`Hello from /inspections/${id}\nIf you see this, the dynamic route works.`}
    </pre>
  );
}
