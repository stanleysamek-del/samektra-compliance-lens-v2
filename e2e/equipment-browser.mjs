import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import bwipjs from "bwip-js";
import sharp from "sharp";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vitest/package.json"));
const { createServer } = viteRequire("vite");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = path.join(root, "e2e/harness");
const server = await createServer({
  configFile: false,
  root: harness,
  publicDir: path.join(root, "public"),
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: "next/navigation",
        replacement: path.join(harness, "navigation.ts"),
      },
      { find: "next/link", replacement: path.join(harness, "link.tsx") },
      {
        find: "@/app/assets/actions",
        replacement: path.join(harness, "actions.ts"),
      },
      {
        find: "@/app/actions/plans",
        replacement: path.join(harness, "actions.ts"),
      },
      { find: "@", replacement: root },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4178,
    strictPort: true,
    fs: { allow: [root] },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "@zxing/browser",
      "exceljs",
      "pdfjs-dist",
    ],
  },
});
mkdirSync(path.join(root, "test-results"), { recursive: true });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 850 },
  });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ||
      ["blob:", "data:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  const origin = "http://127.0.0.1:4178";
  await page.goto(origin);
  await page.getByRole("button", { name: "Start camera" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Start camera" }).isDisabled(),
    false,
  );
  await page.getByRole("button", { name: "Start camera" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Camera unavailable" })
    .waitFor();
  console.log("PASS: camera failure offers image and manual alternatives");
  const barcode = await bwipjs.toBuffer({
    bcid: "code128",
    text: "000123",
    scale: 3,
    height: 18,
    padding: 12,
    includetext: true,
  });
  await page
    .getByLabel("Barcode image", { exact: true })
    .setInputFiles({
      name: "equipment.png",
      mimeType: "image/png",
      buffer: barcode,
    });
  await page.getByLabel("Complete barcode content").waitFor();
  assert.equal(await page.getByLabel("Complete barcode content").inputValue(), "000123");
  assert.equal(await page.getByRole("button", { name: "Find matching equipment" }).isDisabled(), true);
  await page.getByLabel("Building").selectOption("building-a");
  await page.getByRole("button", { name: "Find matching equipment" }).click();
  await page.waitForURL("**/assets?facility=building-a&barcode=000123&scan=1");
  console.log(
    "PASS: real Code 128 image decodes with leading zeros and building scope",
  );
  await page.goto(origin);
  await page.getByLabel("Building").selectOption("building-b");
  const qr = await bwipjs.toBuffer({
    bcid: "qrcode",
    text: "https://untrusted.example/0001",
    scale: 5,
    padding: 12,
  });
  await page
    .getByLabel("Barcode image", { exact: true })
    .setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: qr });
  await page.getByLabel("Complete barcode content").waitFor();
  assert.equal(await page.getByLabel("Complete barcode content").inputValue(), "https://untrusted.example/0001");
  assert.equal(new URL(page.url()).pathname, "/");
  await page.getByRole("button", { name: "Find matching equipment" }).click();
  await page.waitForURL("**/assets?facility=building-b&barcode=**");
  assert(
    new URL(page.url()).searchParams.get("barcode") ===
      "https://untrusted.example/0001",
  );
  console.log("PASS: QR URLs are treated as identifiers, never followed");
  await page.goto(origin);
  const payload = 'BEGIN:VCARD\nFN:Equipment Test\nNOTE:' + 'Complete payload '.repeat(25) + '\nEND:VCARD';
  await page.getByLabel("Barcode image", { exact: true }).setInputFiles({ name: "long-qr.png", mimeType: "image/png",
    buffer: await bwipjs.toBuffer({ bcid: "qrcode", text: payload, scale: 4, padding: 12 }) });
  await page.getByLabel("Complete barcode content").waitFor();
  assert.equal(await page.getByLabel("Complete barcode content").inputValue(), payload);
  console.log("PASS: multiline QR payload beyond 160 characters is preserved without a building or navigation");
  await page.goto(origin);
  await page.getByLabel("Barcode image", { exact: true }).setInputFiles({ name: "vertical.png", mimeType: "image/png",
    buffer: await sharp(barcode).rotate(90).png().toBuffer() });
  await page.getByLabel("Complete barcode content").waitFor();
  assert.equal(await page.getByLabel("Complete barcode content").inputValue(), "000123");
  console.log("PASS: vertical Code 128 decodes through orientation retries");
  await page.route("**/test-barcode.png", route => route.fulfill({ contentType: "image/png", body: barcode }));
  await page.goto(origin + "/?mode=photo");
  await page.getByRole("button", { name: "Read barcode from this photo" }).click();
  await page.getByRole("status").filter({ hasText: "Barcode read" }).waitFor();
  assert.equal(await page.getByLabel("Complete barcode content", { exact: true }).inputValue(), "000123");
  console.log("PASS: saved inspection photo decodes without re-uploading");

  for (const bcid of ["datamatrix", "pdf417"]) {
    await page.goto(origin);
    const text = "SERIAL=000123;MODEL=TEST-42;LOT=0099";
    await page.getByLabel("Barcode image", { exact: true }).setInputFiles({ name: bcid + ".png", mimeType: "image/png",
      buffer: await bwipjs.toBuffer({ bcid, text, scale: 4, padding: 12 }) });
    await page.getByLabel("Complete barcode content").waitFor();
    assert.equal(await page.getByLabel("Complete barcode content").inputValue(), text);
    console.log(`PASS: ${bcid} preserves all encoded fields`);
  }
  async function openImport(file) {
    await page.goto(origin + "/?mode=import");
    await page
      .getByText("Import equipment from a building report", { exact: true })
      .click();
    await page.getByLabel("Destination building").selectOption("building-a");
    await page.getByLabel("Building equipment report").setInputFiles(file);
    await page.getByRole("button", { name: "Prepare review" }).waitFor();
    await page.getByRole("button", { name: "Prepare review" }).click();
    await page.getByLabel("Row 1 barcode", { exact: true }).waitFor();
  }
  await openImport({
    name: "report.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Barcode,Location,Serial Number\n000123,"West, room 2",00999',
    ),
  });
  assert.equal(
    await page.getByLabel("Row 1 barcode", { exact: true }).inputValue(),
    "000123",
  );
  assert.equal(
    await page.getByLabel("Row 1 location", { exact: true }).inputValue(),
    "West, room 2",
  );
  await page.getByRole("button", { name: "Confirm and import 1 rows" }).click();
  await page.getByRole("status").filter({ hasText: "1 added" }).waitFor();
  const imported = await page.evaluate(() => window.lastImport);
  assert.equal(imported.overwrite, false);
  assert.equal(imported.rows[0].serial, "00999");
  console.log(
    "PASS: CSV review sends confirmed rows and skips existing records by default",
  );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Extinguishers");
  sheet.addRow(["Barcode", "Location"]);
  sheet.addRow([123, "East stair"]);
  sheet.getCell("A2").numFmt = "000000";
  await openImport({
    name: "report.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  assert.equal(
    await page.getByLabel("Row 1 barcode", { exact: true }).inputValue(),
    "000123",
  );
  console.log("PASS: Excel formatted barcode zeros survive import");
  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage([600, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [text, x, y] of [
    ["Barcode", 40, 350],
    ["Location", 220, 350],
    ["000456", 40, 320],
    ["North corridor", 220, 320],
  ])
    pdfPage.drawText(text, { x, y, font, size: 12 });
  await openImport({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  assert.equal(
    await page.getByLabel("Row 1 barcode", { exact: true }).inputValue(),
    "000456",
  );
  assert.equal(
    await page.getByLabel("Row 1 location", { exact: true }).inputValue(),
    "North corridor",
  );
  console.log(
    "PASS: PDF text columns populate the review using the local worker",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(root, "test-results/equipment-import-mobile.png"),
    fullPage: true,
  });
  await page.goto(origin + "/?mode=plan");
  await page.getByRole("button", { name: "Choose a floor plan" }).click();
  await page
    .getByRole("button", { name: "Place equipment", exact: true })
    .click();
  const surface = page.locator("img").first();
  await surface.waitFor();
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  assert(box);
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page
    .getByRole("button", { name: "Confirm position on First floor" })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "position saved" })
    .waitFor();
  const placed = await page.evaluate(() => window.lastPlacement);
  assert(placed.x >= 0 && placed.x <= 1 && placed.y >= 0 && placed.y <= 1);
  assert.equal(placed.planId, "plan-a");
  console.log(
    "PASS: plan position requires explicit confirmation and normalized coordinates",
  );
  await page.screenshot({
    path: path.join(root, "test-results/equipment-plan-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(failures, []);
  console.log("PASS: no browser runtime errors or external service calls");
} finally {
  await browser?.close();
  await server.close();
}
