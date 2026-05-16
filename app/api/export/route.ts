/* app/api/export/route.ts — POST endpoint that turns export data into a
 * downloadable .xlsx file.
 *
 * Why a server route at all (when the workbook could be generated in the
 * browser)? Two reasons:
 *   1. Filename + Content-Disposition: a server response can trigger the
 *      browser's native download UI with a sensible filename without
 *      relying on a Blob URL hack.
 *   2. It keeps the SheetJS dependency off the client bundle for users who
 *      never click the export button.
 *
 * The request body is the same ExportData shape used by src/lib/export.ts.
 * Dates inside transactions arrive as ISO strings (JSON has no Date type) —
 * we rehydrate them before passing to the export module so that the
 * Transactions sheet shows real Excel dates rather than strings. */

import { NextRequest } from "next/server";

import { generateExcel, sanitiseTaxYearForFilename } from "@/src/lib/export";
import type { ExportData } from "@/src/lib/export";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  let payload: ExportData;
  try {
    payload = (await request.json()) as ExportData;
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!payload?.taxResult?.taxYear) {
    return Response.json(
      { error: "Payload is missing taxResult.taxYear." },
      { status: 400 },
    );
  }

  // Date fields arrive as ISO strings over JSON; rehydrate so the Excel
  // sheet shows real date cells.
  for (const tx of payload.transactions ?? []) {
    if (typeof tx.date === "string") {
      tx.date = new Date(tx.date);
    }
  }

  const buffer = generateExcel(payload);
  const filename = `uk-tax-${sanitiseTaxYearForFilename(payload.taxResult.taxYear)}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
