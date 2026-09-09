import { parseCsv, detectColumns } from "./asset-import";
export type ReportTable = { name: string; rows: string[][] };
/** Runs only in the browser: source reports are never sent to an AI provider. */
export async function readEquipmentReport(file: File): Promise<ReportTable[]> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a report smaller than 20 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "tsv")
    return [{ name: file.name, rows: parseCsv(await file.text()) }];
  if (ext === "xlsx") {
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    return book.worksheets.map((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow((row) => {
        const values: string[] = [];
        for (let n = 1; n <= Math.min(sheet.columnCount, 80); n++) {
          const cell = row.getCell(n);
          let value = cell.text;
          if (typeof cell.value === "number" && /^0+$/.test(cell.numFmt ?? ""))
            value = String(cell.value).padStart(cell.numFmt.length, "0");
          values.push(value);
        }
        if (values.some((v) => v.trim())) rows.push(values);
      });
      return { name: sheet.name, rows };
    });
  }
  if (ext !== "pdf")
    throw new Error(
      "Choose CSV, TSV, XLSX, or PDF. Export legacy .xls files as .xlsx first.",
    );
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100)
      throw new Error("Split reports longer than 100 pages before importing.");
    const tables: ReportTable[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const lines: {
        y: number;
        parts: { x: number; text: string; width: number }[];
      }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        let line = lines.find((l) => Math.abs(l.y - item.transform[5]) < 3);
        if (!line) {
          line = { y: item.transform[5], parts: [] };
          lines.push(line);
        }
        line.parts.push({
          x: item.transform[4],
          text: item.str,
          width: item.width,
        });
      }
      lines.sort((a, b) => b.y - a.y);
      for (const line of lines) line.parts.sort((a, b) => a.x - b.x);
      // Locate a real barcode header. Do not infer equipment IDs from arbitrary numbers in prose.
      let columns: { x: number; text: string; width: number }[] | null = null;
      const rows: string[][] = [];
      for (const line of lines) {
        const cells: { x: number; text: string; width: number }[] = [];
        for (const p of line.parts) {
          const prev = cells.at(-1);
          if (prev && p.x - (prev.x + prev.width) < 10) {
            prev.text += " " + p.text;
            prev.width = p.x + p.width - prev.x;
          } else cells.push({ ...p });
        }
        if (!columns) {
          if (detectColumns(cells.map((c) => c.text)).barcode < 0) continue;
          columns = cells;
          rows.push(cells.map((c) => c.text));
          continue;
        }
        const values = columns.map(() => "");
        for (const p of line.parts) {
          let idx = 0;
          for (let c = 1; c < columns.length; c++) {
            if (p.x >= columns[c].x - 5) idx = c;
          }
          values[idx] += (values[idx] ? " " : "") + p.text;
        }
        if (detectColumns(values).barcode >= 0) continue;
        rows.push(values);
      }
      if (rows.length > 1) tables.push({ name: `Page ${pageNum}`, rows });
      page.cleanup();
    }
    if (!tables.length)
      throw new Error(
        "No readable equipment table with a barcode header was found. Image-only PDFs need a text/spreadsheet export. Use barcode image scanning for individual equipment IDs.",
      );
    return tables;
  } finally {
    await task.destroy();
  }
}
