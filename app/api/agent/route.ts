/* app/api/agent/route.ts — POST endpoint for the AI tax assistant.
 *
 * Accepts `{ context, history, message }`, returns `{ reply: string }`.
 * Returns 503 with a friendly hint when ANTHROPIC_API_KEY is unset so the
 * Sprint 10 chat UI can hide the panel gracefully rather than crash. */

import { NextRequest } from "next/server";

import {
  askAgent,
  type AgentContext,
  type AgentMessage,
} from "@/src/lib/agent";

export const runtime = "nodejs";

interface AgentRequestBody {
  context?: AgentContext;
  history?: AgentMessage[];
  message?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error: "Agent unavailable",
        hint: "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local and restart to enable the chat.",
      },
      { status: 503 },
    );
  }

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (
    !body?.context?.taxResult ||
    !body?.context?.rules ||
    typeof body?.message !== "string" ||
    body.message.trim() === ""
  ) {
    return Response.json(
      {
        error:
          "Missing required fields. Body must include { context: { taxResult, suggestions, rules }, history, message: string }.",
      },
      { status: 400 },
    );
  }

  try {
    const reply = await askAgent(
      body.context,
      body.history ?? [],
      body.message,
    );
    return Response.json({ reply });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown agent error.";
    return Response.json(
      { error: `Agent error: ${message}` },
      { status: 500 },
    );
  }
}
