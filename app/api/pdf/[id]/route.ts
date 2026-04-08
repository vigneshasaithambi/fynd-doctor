import { NextResponse } from "next/server";
import { renderReportPdf } from "@/lib/services/pdf";
import { consumeToken, getClientIp } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Per-IP rate limit (scale plan Step 3)
  const ip = getClientIp(req);
  const limit = consumeToken(ip, "pdf");
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many PDF requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const { id } = await ctx.params;
  try {
    const buf = await renderReportPdf(id);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cro-report-${id}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
