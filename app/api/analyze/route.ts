import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage, AnalyzeError } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 90;

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/analyze
 *
 * Body: multipart/form-data with field "image" (File).
 * Auth: requires a logged-in Supabase user.
 *
 * Returns the parsed ComplianceAnalysis JSON. Does NOT persist anything —
 * the caller is responsible for storing the photo + findings to the DB.
 */
export async function POST(request: NextRequest) {
  // ---- Auth ----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // ---- Parse body ----
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'image' field" },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported image type '${file.type}'. Use JPEG, PNG, or WebP.`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image is too large (${file.size} bytes; max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  // ---- Convert to base64 ----
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // ---- Run analysis ----
  try {
    const result = await analyzeImage(base64, file.type);
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
      analysis: result.analysis,
    });
  } catch (err) {
    const message =
      err instanceof AnalyzeError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown analysis error";
    console.error("[/api/analyze] failed:", err);
    return NextResponse.json(
      { error: message },
      { status: 502 },
    );
  }
}
