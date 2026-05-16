/* app/api/agent/route.ts — server-side chat endpoint used by "managed
 * mode" (set NEXT_PUBLIC_AGENT_MODE=managed in env). Reads
 * ANTHROPIC_API_KEY from the server environment so the user's
 * accountants / testers don't have to configure their own keys; the
 * operator pays for these chats.
 *
 * Streams Anthropic's response as Server-Sent Events so the chat panel
 * shows tokens as they arrive. The client (src/lib/agentClient.ts
 * streamManagedChat) parses each `data:` line as JSON of shape
 * `{ text?: string; error?: string }`, ending on `data: [DONE]`. */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

import {
  AGENT_MAX_TOKENS,
  buildSystemPrompt,
  HISTORY_LIMIT,
  trimHistory,
  type AgentContext,
  type AgentMessage,
} from "@/src/lib/agentPrompt";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-5";

interface AgentRequestBody {
  context?: AgentContext;
  history?: AgentMessage[];
  message?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error: "Agent unavailable",
        hint: "ANTHROPIC_API_KEY is not configured on the server. Add it in the Vercel project settings (or .env.local) to enable managed-mode chat.",
      },
      { status: 503 },
    );
  }

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
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

  const client = new Anthropic({ apiKey });
  const systemPrompt = buildSystemPrompt(body.context);
  const trimmed = trimHistory(body.history ?? [], HISTORY_LIMIT);
  const apiMessages: Anthropic.MessageParam[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  apiMessages.push({ role: "user", content: body.message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };
      try {
        const apiStream = client.messages.stream({
          model: MODEL,
          max_tokens: AGENT_MAX_TOKENS,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: apiMessages,
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
        const msg = err instanceof Error ? err.message : "Unknown agent error.";
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
