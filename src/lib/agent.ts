/* src/lib/agent.ts — server-side Claude provider used by the `/api/agent`
 * route as a fallback when no browser-side BYOK key is configured.
 *
 * Browser-side multi-provider chat (Claude / OpenAI / Gemini / Groq /
 * Ollama) lives in src/lib/agentClient.ts. Shared types and prompt
 * construction live in src/lib/agentPrompt.ts. */

import Anthropic from "@anthropic-ai/sdk";

import {
  AGENT_MAX_TOKENS,
  buildSystemPrompt,
  HISTORY_LIMIT,
  trimHistory,
  type AgentContext,
  type AgentMessage,
} from "./agentPrompt";

// Re-export shared types so existing imports of agent.ts keep working.
export type { AgentContext, AgentMessage } from "./agentPrompt";
export {
  AGENT_MAX_TOKENS,
  HISTORY_LIMIT,
  buildSystemPrompt,
  trimHistory,
} from "./agentPrompt";

// ─── Provider abstraction ──────────────────────────────────────────────────

export interface AgentProvider {
  ask(
    context: AgentContext,
    history: AgentMessage[],
    message: string,
  ): Promise<string>;
}

/** Brief: "Model: `claude-sonnet-4-5`." */
export const AGENT_MODEL = "claude-sonnet-4-5";

export class ClaudeAgent implements AgentProvider {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  async ask(
    context: AgentContext,
    history: AgentMessage[],
    message: string,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt(context);
    const trimmed = trimHistory(history, HISTORY_LIMIT);

    const apiMessages: Anthropic.MessageParam[] = trimmed.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    apiMessages.push({ role: "user", content: message });

    const response = await this.client.messages.create({
      model: AGENT_MODEL,
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

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
}

/**
 * Placeholder for a future server-side Ollama provider. The browser-side
 * chat in Sprint 10 talks to localhost Ollama directly via fetch — see
 * src/lib/agentClient.ts. This stub stays for symmetry with `getProvider`.
 */
export class OllamaAgent implements AgentProvider {
  async ask(): Promise<string> {
    throw new Error(
      "Server-side Ollama is not implemented; the browser-side chat in Sprint 10 talks to local Ollama directly.",
    );
  }
}

export function getProvider(name?: string): AgentProvider {
  const resolved = (name ?? process.env.AGENT_PROVIDER ?? "claude").toLowerCase();
  if (resolved === "ollama") return new OllamaAgent();
  if (resolved === "claude") return new ClaudeAgent();
  throw new Error(`Unknown agent provider: ${resolved}`);
}

export async function askAgent(
  context: AgentContext,
  history: AgentMessage[],
  message: string,
): Promise<string> {
  const provider = getProvider();
  return provider.ask(context, history, message);
}
