import { NextResponse } from "next/server";
import { readScreenshot } from "@/lib/utils/storage";

export const runtime = "nodejs";

// Path-traversal guard: only allow alphanumerics, dashes, underscores, dots
// in the screenshot filename. Blocks `..`, `/`, backslashes, etc. Found by
// the test suite's #134 case.
const SAFE_NAME = /^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; name: string }> },
) {
  const { id, name } = await ctx.params;
  if (!SAFE_NAME.test(name)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  const data = await readScreenshot(id, name);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
