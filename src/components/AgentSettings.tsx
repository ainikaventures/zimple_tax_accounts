/* src/components/AgentSettings.tsx — settings modal where the user pastes
 * API keys for whichever providers they want to use and picks the active
 * one. Keys live in browser localStorage only. */

"use client";

import { useEffect, useRef, useState } from "react";

import {
  AGENT_STORAGE_KEY,
  DEFAULT_AGENT_CONFIG,
  PROVIDERS,
  loadAgentConfig,
  saveAgentConfig,
  type AgentClientConfig,
  type ProviderKey,
} from "@/src/lib/agentClient";

interface AgentSettingsProps {
  open: boolean;
  onClose: () => void;
  /** Called every time the user commits changes so the parent re-renders. */
  onChange: (config: AgentClientConfig) => void;
}

const PROVIDER_ORDER: ProviderKey[] = [
  "ollama",
  "groq",
  "gemini",
  "openai",
  "claude",
];

export function AgentSettings({ open, onClose, onChange }: AgentSettingsProps) {
  const [config, setConfig] = useState<AgentClientConfig>(DEFAULT_AGENT_CONFIG);
  const [revealed, setRevealed] = useState<Set<ProviderKey>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setConfig(loadAgentConfig());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const commit = (next: AgentClientConfig) => {
    setConfig(next);
    saveAgentConfig(next);
    onChange(next);
  };

  const setKey = (provider: ProviderKey, value: string) => {
    commit({
      ...config,
      keys: { ...config.keys, [provider]: value.trim() || undefined },
    });
  };

  const setModel = (provider: ProviderKey, value: string) => {
    commit({
      ...config,
      models: { ...config.models, [provider]: value },
    });
  };

  const setActive = (provider: ProviderKey) => {
    commit({ ...config, activeProvider: provider });
  };

  const setOllamaUrl = (value: string) => {
    commit({ ...config, ollamaBaseUrl: value });
  };

  const toggleReveal = (provider: ProviderKey) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const clearAll = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove all stored API keys from this browser?")
    ) {
      return;
    }
    commit({ ...DEFAULT_AGENT_CONFIG });
    setRevealed(new Set());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded bg-paper shadow-2xl"
      >
        <header className="sticky top-0 bg-paper border-b border-rule px-6 py-4 flex items-center justify-between">
          <div>
            <h2
              id="agent-settings-title"
              className="font-serif text-2xl text-ink"
            >
              Agent settings
            </h2>
            <p className="mt-1 text-xs text-muted max-w-md">
              Pick a provider and paste your API key. Keys are stored in this
              browser only — they are never sent to our servers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-2xl leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        <div className="px-6 py-4 space-y-3">
          {PROVIDER_ORDER.map((key) => {
            const info = PROVIDERS[key];
            const isActive = config.activeProvider === key;
            const hasKey = Boolean(config.keys[key]?.trim());
            const isReady = info.keyOptional || hasKey;
            return (
              <article
                key={key}
                className={[
                  "rounded border transition-colors",
                  isActive
                    ? "border-accent ring-1 ring-accent/40"
                    : "border-rule",
                ].join(" ")}
              >
                <div className="px-4 py-3 flex flex-wrap items-start gap-3 justify-between">
                  <div className="flex-1 min-w-0">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="activeProvider"
                        value={key}
                        checked={isActive}
                        onChange={() => setActive(key)}
                        className="h-4 w-4 text-accent focus:ring-accent"
                      />
                      <span className="font-serif text-lg text-ink">
                        {info.label}
                      </span>
                      {isReady ? (
                        <span className="ml-2 inline-block text-[10px] uppercase tracking-[0.14em] text-accent">
                          ready
                        </span>
                      ) : (
                        <span className="ml-2 inline-block text-[10px] uppercase tracking-[0.14em] text-muted">
                          no key set
                        </span>
                      )}
                    </label>
                    <p className="mt-1 text-xs text-muted leading-relaxed">
                      {info.description}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-rule space-y-3 bg-ink/[0.02]">
                  {key === "ollama" ? (
                    <label className="block">
                      <span className="block text-xs uppercase tracking-[0.14em] text-muted mb-1">
                        Ollama base URL
                      </span>
                      <input
                        type="url"
                        value={config.ollamaBaseUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="w-full px-3 py-2 text-sm font-mono border border-rule rounded focus:outline-none focus:ring-2 focus:ring-accent bg-paper"
                      />
                      <p className="mt-1 text-[11px] text-muted">
                        Run{" "}
                        <code className="font-mono">
                          OLLAMA_ORIGINS=* ollama serve
                        </code>{" "}
                        so the browser can reach it cross-origin.
                      </p>
                    </label>
                  ) : (
                    <label className="block">
                      <span className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted mb-1">
                        <span>API key</span>
                        <span>
                          {info.keyHref && (
                            <a
                              href={info.keyHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent underline underline-offset-2 normal-case"
                            >
                              get one →
                            </a>
                          )}
                        </span>
                      </span>
                      <div className="flex items-stretch">
                        <input
                          type={revealed.has(key) ? "text" : "password"}
                          value={config.keys[key] ?? ""}
                          onChange={(e) => setKey(key, e.target.value)}
                          placeholder="sk-…"
                          autoComplete="off"
                          spellCheck={false}
                          className="flex-1 min-w-0 px-3 py-2 text-sm font-mono border border-rule rounded-l focus:outline-none focus:ring-2 focus:ring-accent bg-paper"
                        />
                        <button
                          type="button"
                          onClick={() => toggleReveal(key)}
                          className="px-3 text-xs border border-l-0 border-rule rounded-r bg-paper text-muted hover:text-ink"
                        >
                          {revealed.has(key) ? "hide" : "show"}
                        </button>
                      </div>
                    </label>
                  )}

                  <label className="block">
                    <span className="block text-xs uppercase tracking-[0.14em] text-muted mb-1">
                      Model
                    </span>
                    <select
                      value={config.models[key] ?? info.defaultModel}
                      onChange={(e) => setModel(key, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-rule rounded focus:outline-none focus:ring-2 focus:ring-accent bg-paper"
                    >
                      {info.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="sticky bottom-0 bg-paper border-t border-rule px-6 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted underline underline-offset-4 hover:text-accent"
          >
            Forget all keys on this device
          </button>
          <div className="text-[11px] text-muted text-right max-w-sm">
            Keys live in <code className="font-mono">localStorage</code> on
            this device. XSS would expose them. For shared deployments use
            server-side env vars instead.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm bg-accent text-paper px-4 py-2 text-sm font-medium hover:bg-accent-deep"
          >
            Done
          </button>
        </footer>
      </div>
      <input type="hidden" name="storage-key" value={AGENT_STORAGE_KEY} />
    </div>
  );
}
