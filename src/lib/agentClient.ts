/* src/lib/agentClient.ts — browser-side multi-provider chat client.
 *
 * Each user picks a provider (Claude / OpenAI / Gemini / Groq / Ollama) and
 * pastes their own API key into the settings panel. Keys live in
 * localStorage on their device; chat completions are streamed directly
 * from their browser to the provider's API — our server is never in the
 * loop. This keeps operator cost at literally zero for SaaS-style hosting
 * and keeps the user's tax data out of any intermediate hop.
 *
 * Caveat that must be surfaced in the UI: API keys live in browser
 * localStorage, which means any JS running on this origin can read them.
 * For a noncommercial personal-use tool that's acceptable with proper
 * warning; for a hardened deployment the operator would use server-side
 * env vars and the existing /api/agent route instead. */

"use client";

import {
  AGENT_MAX_TOKENS,
  buildSystemPrompt,
  HISTORY_LIMIT,
  trimHistory,
  type AgentContext,
  type AgentMessage,
} from "./agentPrompt";

// ─── Provider catalogue ────────────────────────────────────────────────────

/**
 * One Claude / OpenAI / Gemini / Groq / Ollama backend. The browser routes
 * every chat completion through the active provider's API.
 */
export type ProviderKey = "claude" | "openai" | "gemini" | "groq" | "ollama";

export interface ProviderInfo {
  /** Display name (chat header, settings panel). */
  label: string;
  /** One-line "what is this" copy for the settings panel. */
  description: string;
  /** Where to send the user to obtain a key. Null for Ollama (no key needed). */
  keyHref: string | null;
  /** Default model id for this provider. */
  defaultModel: string;
  /** Other models the user can pick from in the dropdown. */
  models: string[];
  /** True if this provider doesn't require an API key (Ollama). */
  keyOptional?: boolean;
}

export const PROVIDERS: Record<ProviderKey, ProviderInfo> = {
  claude: {
    label: "Claude (Anthropic)",
    description:
      "Anthropic's Claude. Highest quality for nuanced tax-rule reasoning; per-turn cost ~£0.01.",
    keyHref: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-4-5",
    models: [
      "claude-opus-4-7",
      "claude-sonnet-4-5",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    description:
      "OpenAI's GPT models. Similar quality to Claude at a similar price.",
    keyHref: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  gemini: {
    label: "Google Gemini",
    description:
      "Google's Gemini. Generous free tier; quality varies by model.",
    keyHref: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-1.5-pro",
    models: [
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-2.0-flash-exp",
    ],
  },
  groq: {
    label: "Groq (open models)",
    description:
      "Llama / Mistral / Qwen via Groq's ultra-fast hosted API. Free tier covers light personal use; ~20× cheaper than Claude.",
    keyHref: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
    ],
  },
  ollama: {
    label: "Ollama (local, free)",
    description:
      "Runs entirely on your machine. Zero cost, full privacy, works offline. Requires installing Ollama (ollama.com) and pulling a model.",
    keyHref: null,
    defaultModel: "llama3.1:8b",
    models: ["llama3.1:8b", "llama3.1:70b", "qwen2.5:7b", "mistral:latest"],
    keyOptional: true,
  },
};

// ─── Persisted config ──────────────────────────────────────────────────────

export interface AgentClientConfig {
  activeProvider: ProviderKey;
  /** Selected model per provider; falls back to PROVIDERS[k].defaultModel. */
  models: Partial<Record<ProviderKey, string>>;
  /** User-supplied API keys per provider; never sent off-device. */
  keys: Partial<Record<ProviderKey, string>>;
  /** Where the Ollama HTTP API lives. */
  ollamaBaseUrl: string;
}

export const AGENT_STORAGE_KEY = "uk-tax-advisor:agent";

export const DEFAULT_AGENT_CONFIG: AgentClientConfig = {
  activeProvider: "ollama",
  models: {},
  keys: {},
  ollamaBaseUrl: "http://localhost:11434",
};

export function loadAgentConfig(): AgentClientConfig {
  if (typeof window === "undefined") return DEFAULT_AGENT_CONFIG;
  try {
    const raw = window.localStorage.getItem(AGENT_STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AgentClientConfig>;
    return {
      ...DEFAULT_AGENT_CONFIG,
      ...parsed,
      models: { ...DEFAULT_AGENT_CONFIG.models, ...(parsed.models ?? {}) },
      keys: { ...DEFAULT_AGENT_CONFIG.keys, ...(parsed.keys ?? {}) },
    };
  } catch {
    return DEFAULT_AGENT_CONFIG;
  }
}

export function saveAgentConfig(config: AgentClientConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // private mode / quota — ignore
  }
}

/** Resolve the effective model for the active provider. */
export function modelFor(config: AgentClientConfig, key?: ProviderKey): string {
  const k = key ?? config.activeProvider;
  return config.models[k] ?? PROVIDERS[k].defaultModel;
}

/** True when the active provider is usable from the browser. */
export function providerReady(config: AgentClientConfig): boolean {
  const k = config.activeProvider;
  if (PROVIDERS[k].keyOptional) return true;
  return Boolean(config.keys[k]?.trim());
}

// ─── SSE parser ────────────────────────────────────────────────────────────

/**
 * Parse a Server-Sent-Events stream into a sequence of parsed JSON event
 * objects. Each "event" is a blank-line-separated block in the stream;
 * within that block, `data:` lines are concatenated and JSON-parsed. The
 * SSE sentinel `[DONE]` terminates the generator.
 */
async function* parseSSE(body: ReadableStream<Uint8Array> | null): AsyncGenerator<unknown> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = event
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.replace(/^data:\s?/, ""));
        if (dataLines.length === 0) continue;
        const dataStr = dataLines.join("\n");
        if (dataStr === "[DONE]") return;
        try {
          yield JSON.parse(dataStr);
        } catch {
          // skip malformed event
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a newline-delimited JSON stream (Ollama's native format).
 */
async function* parseNDJSON(body: ReadableStream<Uint8Array> | null): AsyncGenerator<unknown> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch {
          // skip malformed line
        }
      }
    }
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer);
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Per-provider streaming ────────────────────────────────────────────────

interface StreamOpts {
  config: AgentClientConfig;
  systemPrompt: string;
  history: AgentMessage[];
  message: string;
}

async function* streamClaude(opts: StreamOpts): AsyncGenerator<string> {
  const key = opts.config.keys.claude;
  if (!key) throw new Error("Claude API key is not set.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelFor(opts.config, "claude"),
      max_tokens: AGENT_MAX_TOKENS,
      stream: true,
      system: opts.systemPrompt,
      messages: [
        ...opts.history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: opts.message },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Claude API error ${response.status}: ${await response.text()}`);
  }
  for await (const ev of parseSSE(response.body)) {
    const e = ev as { type?: string; delta?: { type?: string; text?: string } };
    if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && typeof e.delta.text === "string") {
      yield e.delta.text;
    }
  }
}

async function* streamOpenAICompatible(opts: StreamOpts & {
  baseUrl: string;
  apiKey: string;
  model: string;
}): AsyncGenerator<string> {
  const response = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: AGENT_MAX_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: opts.systemPrompt },
        ...opts.history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: opts.message },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`);
  }
  for await (const ev of parseSSE(response.body)) {
    const e = ev as { choices?: { delta?: { content?: string } }[] };
    const delta = e.choices?.[0]?.delta?.content;
    if (typeof delta === "string") yield delta;
  }
}

async function* streamOpenAI(opts: StreamOpts): AsyncGenerator<string> {
  const key = opts.config.keys.openai;
  if (!key) throw new Error("OpenAI API key is not set.");
  yield* streamOpenAICompatible({
    ...opts,
    baseUrl: "https://api.openai.com/v1",
    apiKey: key,
    model: modelFor(opts.config, "openai"),
  });
}

async function* streamGroq(opts: StreamOpts): AsyncGenerator<string> {
  const key = opts.config.keys.groq;
  if (!key) throw new Error("Groq API key is not set.");
  yield* streamOpenAICompatible({
    ...opts,
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: key,
    model: modelFor(opts.config, "groq"),
  });
}

async function* streamGemini(opts: StreamOpts): AsyncGenerator<string> {
  const key = opts.config.keys.gemini;
  if (!key) throw new Error("Gemini API key is not set.");
  const model = modelFor(opts.config, "gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const contents = [
    ...opts.history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: opts.message }] },
  ];
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: AGENT_MAX_TOKENS },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }
  for await (const ev of parseSSE(response.body)) {
    const e = ev as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = e.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === "string") yield text;
  }
}

async function* streamOllama(opts: StreamOpts): AsyncGenerator<string> {
  const response = await fetch(`${opts.config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: modelFor(opts.config, "ollama"),
      stream: true,
      messages: [
        { role: "system", content: opts.systemPrompt },
        ...opts.history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: opts.message },
      ],
      options: { num_predict: AGENT_MAX_TOKENS },
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }
  for await (const ev of parseNDJSON(response.body)) {
    const e = ev as { message?: { content?: string }; done?: boolean };
    if (e.message?.content) yield e.message.content;
    if (e.done) return;
  }
}

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Stream a chat completion from the user's currently-active provider.
 * Yields text chunks as they arrive; the caller concatenates and renders.
 */
export async function* streamChat(
  config: AgentClientConfig,
  context: AgentContext,
  history: AgentMessage[],
  message: string,
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(context);
  const trimmed = trimHistory(history, HISTORY_LIMIT);
  const opts: StreamOpts = { config, systemPrompt, history: trimmed, message };

  switch (config.activeProvider) {
    case "claude":
      yield* streamClaude(opts);
      return;
    case "openai":
      yield* streamOpenAI(opts);
      return;
    case "gemini":
      yield* streamGemini(opts);
      return;
    case "groq":
      yield* streamGroq(opts);
      return;
    case "ollama":
      yield* streamOllama(opts);
      return;
    default: {
      const exhaustive: never = config.activeProvider;
      throw new Error(`Unknown provider: ${String(exhaustive)}`);
    }
  }
}
