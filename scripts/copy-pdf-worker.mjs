import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
copyFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),"public/pdf.worker.min.mjs");
