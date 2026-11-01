import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { currentMonth, exportRefundsCsv } from "@/apps/refunds/service";
import { AccessDeniedError } from "@/platform/audit";
import { getSession } from "@/platform/auth";

/** GET /refunds/export?month=YYYY-MM. exportRefundsCsv checks can() and writes the audit row. */
export async function GET(request: NextRequest) {
  const user = await getSession();
  const month = request.nextUrl.searchParams.get("month") || currentMonth();
  try {
    const { filename, csv } = exportRefundsCsv(user, month);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) return new Response("Export requires approver or admin.", { status: 403 });
    if (err instanceof ZodError) return new Response("Month must be YYYY-MM.", { status: 400 });
    throw err;
  }
}
