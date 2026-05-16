/* src/components/AgentChat.tsx — collapsible floating chat panel for
 * /calculate. Streams replies from the active browser-configured provider
 * (Claude / OpenAI / Gemini / Groq / Ollama) — keys live in localStorage,
 * fetch calls go directly to the provider's API. No server cost. */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentSettings } from "@/src/components/AgentSettings";
import {
  loadAgentConfig,
  modelFor,
  PROVIDERS,
  providerReady,
  streamChat,
  type AgentClientConfig,
  type ProviderKey,
} from "@/src/lib/agentClient";
import type { AgentContext, AgentMessage } from "@/src/lib/agentPrompt";

const SUGGESTED_PROMPTS = [
  "How is my tax calculated?",
  "Why did I lose personal allowance?",
  "What's the most tax-efficient way to give to charity?",
];

const UI_HISTORY_LIMIT = 16;

interface AgentChatProps {
  context: AgentContext;
}

export function AgentChat({ context }: AgentChatProps) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<AgentClientConfig | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial config hydrate (client only).
  useEffect(() => {
    setConfig(loadAgentConfig());
  }, []);

  // Auto-scroll on new content.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, open]);

  const ready = config ? providerReady(config) : false;
  const activeModel = config ? modelFor(config) : "—";
  const activeLabel = config ? PROVIDERS[config.activeProvider].label : "—";

  const send = useCallback(
    async (text: string) => {
      if (!config || !text.trim() || streaming) return;
      if (!providerReady(config)) {
        setError(
          `Add a ${PROVIDERS[config.activeProvider].label} key in settings to start chatting.`,
        );
        setSettingsOpen(true);
        return;
      }
      const userMsg: AgentMessage = { role: "user", content: text };
      const nextHistory = [...messages, userMsg].slice(-UI_HISTORY_LIMIT);
      setMessages(nextHistory);
      setDraft("");
      setError(null);
      setStreaming(true);
      setStreamingText("");

      let acc = "";
      try {
        const stream = streamChat(config, context, messages, text);
        for await (const chunk of stream) {
          acc += chunk;
          setStreamingText(acc);
        }
        setMessages((prev) =>
          [
            ...prev,
            { role: "assistant" as const, content: acc },
          ].slice(-UI_HISTORY_LIMIT),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setStreaming(false);
        setStreamingText("");
      }
    },
    [config, context, messages, streaming],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const handleSuggested = useCallback(
    (prompt: string) => {
      void send(prompt);
    },
    [send],
  );

  const handleSwitchProvider = useCallback(
    (next: ProviderKey) => {
      if (!config) return;
      const merged = { ...config, activeProvider: next };
      setConfig(merged);
      // Persist via the same shape AgentSettings uses.
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "uk-tax-advisor:agent",
          JSON.stringify(merged),
        );
      }
    },
    [config],
  );

  const showSuggested = open && messages.length === 0 && !streaming;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-accent text-paper px-5 py-3 text-sm font-medium shadow-lg hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          aria-label="Open AI tax assistant"
        >
          Ask about your tax →
        </button>
      )}

      {open && (
        <aside
          className="fixed bottom-4 right-4 z-30 w-full sm:w-[26rem] max-w-[calc(100vw-2rem)] h-[80vh] sm:h-[36rem] flex flex-col rounded-lg border border-rule bg-paper shadow-2xl"
          aria-label="AI tax assistant"
        >
          <header className="px-4 py-3 border-b border-rule flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-serif text-base text-ink leading-tight">
                Tax assistant
              </p>
              {config && (
                <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-muted">
                  <select
                    value={config.activeProvider}
                    onChange={(e) =>
                      handleSwitchProvider(e.target.value as ProviderKey)
                    }
                    className="rounded border border-rule bg-paper px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-accent"
                    aria-label="Active provider"
                  >
                    {(Object.keys(PROVIDERS) as ProviderKey[]).map((k) => (
                      <option key={k} value={k}>
                        {PROVIDERS[k].label}
                      </option>
                    ))}
                  </select>
                  <span className="font-mono truncate" title={activeModel}>
                    {activeModel}
                  </span>
                  <span
                    className={[
                      "inline-block h-1.5 w-1.5 rounded-full",
                      ready ? "bg-accent" : "bg-muted",
                    ].join(" ")}
                    aria-label={ready ? "Provider ready" : "Provider needs a key"}
                  />
                </label>
              )}
            </div>
            <div className="flex items-center gap-1 -mt-1">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="text-muted hover:text-ink p-1"
                aria-label="Open agent settings"
                title="Settings"
              >
                ⚙
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="text-muted hover:text-ink p-1 text-xs"
                aria-label="Clear chat"
                title="Clear conversation"
              >
                clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink p-1 text-xl leading-none"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          >
            {config && !ready && (
              <UnavailableBanner
                providerLabel={activeLabel}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            )}

            {showSuggested && ready && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Try asking:</p>
                <ul className="space-y-1.5">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        onClick={() => handleSuggested(p)}
                        className="w-full text-left rounded border border-rule bg-paper px-3 py-2 text-sm hover:border-accent/60 hover:text-accent"
                      >
                        {p}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role}>
                {m.content}
              </Bubble>
            ))}

            {streaming && (
              <Bubble role="assistant" streaming>
                {streamingText || "…"}
              </Bubble>
            )}

            {error && (
              <div
                role="alert"
                className="text-xs text-accent border border-accent/40 bg-accent/5 rounded px-3 py-2"
              >
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) void send(draft);
            }}
            className="border-t border-rule p-3 flex items-end gap-2"
          >
            <label className="sr-only" htmlFor="agent-input">
              Type your question
            </label>
            <textarea
              id="agent-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) void send(draft);
                }
              }}
              placeholder={
                ready
                  ? "Ask about your tax… (Enter to send, Shift+Enter for newline)"
                  : "Configure a provider to start chatting."
              }
              rows={2}
              disabled={!ready || streaming}
              className="flex-1 min-w-0 resize-none rounded border border-rule bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!ready || streaming || !draft.trim()}
              className="rounded-sm bg-accent text-paper px-4 py-2 text-sm font-medium hover:bg-accent-deep disabled:bg-rule disabled:text-muted disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>

          <p className="px-4 pb-3 text-[10px] text-muted leading-snug">
            AI responses are estimates. Not regulated financial advice. Always
            verify with HMRC or a chartered tax adviser.
          </p>
        </aside>
      )}

      <AgentSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChange={(c) => setConfig(c)}
      />
    </>
  );
}

function Bubble({
  role,
  streaming,
  children,
}: {
  role: "user" | "assistant";
  streaming?: boolean;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed",
          isUser ? "bg-accent text-paper" : "bg-ink/[0.04] text-ink",
          streaming ? "animate-pulse" : "",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

function UnavailableBanner({
  providerLabel,
  onOpenSettings,
}: {
  providerLabel: string;
  onOpenSettings: () => void;
}) {
  return (
    <div className="rounded border border-rule bg-ink/[0.02] p-3 text-sm">
      <p className="text-ink leading-relaxed">
        <strong>{providerLabel}</strong> needs setup before you can chat.
      </p>
      <button
        type="button"
        onClick={onOpenSettings}
        className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-accent text-paper px-3 py-1.5 text-xs font-medium hover:bg-accent-deep"
      >
        Open settings →
      </button>
      <p className="mt-2 text-[11px] text-muted">
        Keys stay in this browser. Free options: install Ollama locally, or
        get a free Groq key.
      </p>
    </div>
  );
}
