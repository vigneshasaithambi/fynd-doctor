import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { screenshotPath, reportDir } from "@/lib/utils/storage";

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
  const p = screenshotPath(id, name);
  // Defense in depth: ensure the resolved path is still inside the report dir.
  const resolvedDir = path.resolve(reportDir(id));
  if (!path.resolve(p).startsWith(resolvedDir + path.sep)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  if (!fs.existsSync(p)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = fs.readFileSync(p);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
