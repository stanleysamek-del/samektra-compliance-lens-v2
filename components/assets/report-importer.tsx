"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSET_TYPES, assetTypeLabel } from "@/lib/assets";
import {
  IMPORT_FIELDS,
  detectColumns,
  validateEquipmentRows,
  type EquipmentImportRow,
} from "@/lib/asset-import";
import type { ReportTable } from "@/lib/read-equipment-report";
import { importEquipment } from "@/app/assets/actions";
export function ReportImporter({
  facilities,
  initialFacility = "",
}: {
  facilities: { id: string; name: string }[];
  initialFacility?: string;
}) {
  const router = useRouter();
  const [facility, setFacility] = useState(initialFacility);
  const [tables, setTables] = useState<ReportTable[]>([]);
  const [tableIndex, setTableIndex] = useState(0);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<EquipmentImportRow[]>([]);
  const [defaultType, setDefaultType] = useState("extinguisher");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const table = tables[tableIndex];
  const headers = table?.rows[headerIndex] ?? [];
  function selectTable(index: number, header = 0) {
    setTableIndex(index);
    setHeaderIndex(header);
    setMapping(detectColumns(tables[index]?.rows[header] ?? []));
    setRows([]);
  }
  async function load(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setRows([]);
    setTables([]);
    try {
      const { readEquipmentReport } =
        await import("@/lib/read-equipment-report");
      const result = await readEquipmentReport(file);
      if (!result.length)
        throw new Error("This file contains no equipment rows.");
      setTables(result);
      setTableIndex(0);
      const index = result[0].rows.findIndex(
        (row) => detectColumns(row).barcode >= 0,
      );
      setHeaderIndex(Math.max(0, index));
      setMapping(detectColumns(result[0].rows[Math.max(0, index)]));
      setMessage(
        "Choose the table and columns, then review every equipment row. PDF extraction may include footers or split lines; remove them before saving.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not read report.");
    } finally {
      setBusy(false);
    }
  }
  function review() {
    if (!table || mapping.barcode < 0 || mapping.barcode === undefined) {
      setMessage("Map the barcode column first.");
      return;
    }
    const data = table.rows
      .slice(headerIndex + 1)
      .filter((row) => row[mapping.barcode]?.trim());
    if (data.length > 500) {
      setMessage(
        "This table exceeds 500 rows. Split the file into smaller imports.",
      );
      return;
    }
    setRows(
      data.map((row) => {
        const item = Object.fromEntries(
          IMPORT_FIELDS.map((f) => [f, (row[mapping[f]] ?? "").trim()]),
        ) as EquipmentImportRow;
        item.type = item.type.toLowerCase().replace(/ /g, "_");
        if (!item.type) item.type = defaultType;
        else if (item.type === "fire_extinguisher") item.type = "extinguisher";
        return item;
      }),
    );
    setMessage(
      "Review IDs, locations, and equipment types below. Blank fields do not erase existing metadata; inspection history and plan positions are preserved.",
    );
  }
  async function save() {
    const invalid = validateEquipmentRows(rows);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setBusy(true);
    try {
      const result = await importEquipment(facility, rows, overwrite);
      if (!result.ok) {
        setMessage(result.error ?? "Import failed.");
        return;
      }
      setMessage(
        `Saved: ${result.result?.added} added, ${result.result?.updated} updated, ${result.result?.skipped} existing records skipped.`,
      );
      setRows([]);
      setTables([]);
      router.refresh();
    } catch {
      setMessage(
        "Connection interrupted. Check the register before retrying; matching barcodes will not create duplicate equipment.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border p-5">
      <summary className="cursor-pointer font-semibold">
        Import equipment from a building report
      </summary>
      <div className="mt-4 space-y-4">
        <p>
          CSV, Excel (.xlsx), or text-based PDF. Reports are read locally
          without paid AI. Import one sheet or PDF page at a time. Confirm the
          building and review the extracted rows before saving.
        </p>
        <a href="/equipment-import-template.csv" download className="underline">
          Download a CSV example
        </a>
        <label className="block">
          Destination building
          <select
            disabled={busy}
            className="cl-input"
            value={facility}
            onChange={(e) => setFacility(e.target.value)}
          >
            <option value="">Choose a building</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Building equipment report
          <input
            type="file"
            accept=".csv,.tsv,.xlsx,.pdf"
            disabled={busy}
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="cl-input"
          />
        </label>
        {table && (
          <details open={!rows.length}>
            <summary className="cursor-pointer font-medium">
              Column mapping
            </summary>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Sheet / page
                <select
                  className="cl-input"
                  value={tableIndex}
                  disabled={busy}
                  onChange={(e) => selectTable(Number(e.target.value))}
                >
                  {tables.map((t, i) => (
                    <option key={i} value={i}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Header row
                <select
                  className="cl-input"
                  value={headerIndex}
                  disabled={busy}
                  onChange={(e) =>
                    selectTable(tableIndex, Number(e.target.value))
                  }
                >
                  {table.rows.slice(0, 30).map((r, i) => (
                    <option key={i} value={i}>
                      {i + 1}: {r.join(" | ").slice(0, 100)}
                    </option>
                  ))}
                </select>
              </label>
              {IMPORT_FIELDS.map((f) => (
                <label key={f}>
                  {f}
                  <select
                    className="cl-input"
                    value={mapping[f] ?? -1}
                    disabled={busy}
                    onChange={(e) => {
                      setRows([]);
                      setMapping({ ...mapping, [f]: Number(e.target.value) });
                    }}
                  >
                    <option value={-1}>Not in report</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                Type when report has no type
                <select
                  className="cl-input"
                  value={defaultType}
                  onChange={(e) => {
                    setDefaultType(e.target.value);
                    setRows([]);
                  }}
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {assetTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="cl-btn-outline"
              disabled={busy}
              onClick={review}
            >
              Prepare review
            </button>
          </details>
        )}
        {rows.length > 0 && (
          <>
            <p>
              {rows.length} equipment rows to review. Scroll the table sideways
              on smaller screens. Codes are matched exactly within the
              destination building.
            </p>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {IMPORT_FIELDS.map((f) => (
                      <th key={f} className="p-2 text-left">
                        {f}
                      </th>
                    ))}
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {IMPORT_FIELDS.map((f) => (
                        <td key={f} className="p-1">
                          {f === "type" ? (
                            <select
                              aria-label={`Row ${i + 1} type`}
                              className="cl-input min-w-36"
                              disabled={busy}
                              value={r.type}
                              onChange={(e) =>
                                setRows(
                                  rows.map((v, j) =>
                                    j === i
                                      ? { ...v, type: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            >
                              {!ASSET_TYPES.some((t) => t === r.type) && (
                                <option value={r.type}>
                                  Choose type ({r.type})
                                </option>
                              )}
                              {ASSET_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {assetTypeLabel(t)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="cl-input min-w-36"
                              disabled={busy}
                              aria-label={`Row ${i + 1} ${f}`}
                              value={r[f]}
                              onChange={(e) =>
                                setRows(
                                  rows.map((v, j) =>
                                    j === i ? { ...v, [f]: e.target.value } : v,
                                  ),
                                )
                              }
                            />
                          )}
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Remove row ${i + 1}`}
                          onClick={() =>
                            setRows(rows.filter((_, j) => j !== i))
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                disabled={busy}
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Update matching equipment with reviewed metadata (otherwise skip
              existing barcodes). This includes the selected equipment type.
            </label>
            <p>
              Text locations are saved to the record. Open an equipment record
              to confirm its floor-plan position; imports never guess
              coordinates.
            </p>
            <button
              type="button"
              className="cl-btn-primary"
              disabled={busy || !facility}
              onClick={save}
            >
              {busy ? "Saving..." : `Confirm and import ${rows.length} rows`}
            </button>
          </>
        )}
        <p role="status">
          {busy && !rows.length ? "Reading report..." : message}
        </p>
      </div>
    </details>
  );
}
