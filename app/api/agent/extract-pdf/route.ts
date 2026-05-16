/* app/api/agent/extract-pdf/route.ts — server-side PDF→CSV extraction for
 * managed mode. Browser extracts the PDF's text layer with PDF.js, then
 * POSTs it here. We send to Anthropic using the server's ANTHROPIC_API_KEY
 * with the same PDF extraction system prompt the BYOK client uses, and
 * stream the CSV back as Server-Sent Events.
 *
 * Same SSE shape as /api/agent: `data: {"text":"…"}` lines terminating
 * with `data: [DONE]`. */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

import { EXTRACTION_MAX_TOKENS } from "@/src/lib/agentPrompt";
import { PDF_EXTRACTION_SYSTEM_PROMPT } from "@/src/lib/agentClient";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-5";
const MAX_PDF_CHARS = 60_000;

interface ExtractRequest {
  pdfText?: string;
  filename?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error: "Agent unavailable",
        hint: "ANTHROPIC_API_KEY is not configured on the server. Add it in Vercel project settings (or .env.local) to enable managed-mode PDF extraction.",
      },
      { status: 503 },
    );
  }

  let body: ExtractRequest;
  try {
    body = (await request.json()) as ExtractRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.pdfText !== "string" || body.pdfText.trim() === "") {
    return Response.json(
      { error: "Missing pdfText. Body must include the extracted PDF text." },
      { status: 400 },
    );
  }

  const filename = body.filename ?? "uploaded.pdf";
  const pdfText = body.pdfText.slice(0, MAX_PDF_CHARS);

  const userMessage = [
    `Source: ${filename}`,
    "",
    "Raw PDF text follows. Extract transactions to CSV.",
    "",
    "```",
    pdfText,
    "```",
  ].join("\n");

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      try {
        const apiStream = client.messages.stream({
          model: MODEL,
          max_tokens: EXTRACTION_MAX_TOKENS,
          system: PDF_EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });
        for await (const event of apiStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta" &&
            typeof event.delta.text === "string"
          ) {
            send({ text: event.delta.text });
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown extraction error.";
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
