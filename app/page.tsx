"use client"

import { useState, useRef, useCallback } from "react"
import { PROBES } from "./lib/probes"
import type { ProbeOutcome } from "./lib/probes"
import { runProbes, type ProbeProgress } from "./lib/runner"
import { determineVerdict, getFamilyName, type Verdict } from "./lib/verdict"

type AppState = "idle" | "running" | "done"

export default function Home() {
  const [url, setUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [state, setState] = useState<AppState>("idle")
  const [progress, setProgress] = useState<ProbeProgress[]>([])
  const [results, setResults] = useState<Record<string, ProbeOutcome> | null>(null)
  const [verdict, setVerdict] = useState<(Verdict & { match: boolean }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleRun = useCallback(async () => {
    if (!url.trim() || !model.trim()) return
    setError(null)
    setState("running")
    setResults(null)
    setVerdict(null)
    setProgress(
      PROBES.map((p) => ({
        probeName: p.name,
        probeLabel: p.label,
        status: "running" as const,
      }))
    )

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const probeResults = await runProbes(
        url.trim(),
        apiKey.trim() || "test",
        model.trim(),
        setProgress,
        controller.signal
      )
      const v = determineVerdict(probeResults, model.trim())
      setResults(probeResults)
      setVerdict(v)
      setState("done")
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setState("idle")
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setState("done")
    }
  }, [url, apiKey, model])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setState("idle")
  }, [])

  const handleReset = useCallback(() => {
    setState("idle")
    setProgress([])
    setResults(null)
    setVerdict(null)
    setError(null)
  }, [])

  const completedCount = progress.filter((p) => p.status !== "running").length

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-sm"
        style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.85)" }}
      >
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background:
                  state === "running"
                    ? "var(--warning)"
                    : state === "done"
                      ? "var(--success)"
                      : "var(--text-tertiary)",
              }}
            />
            <h1 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Model Verifier
            </h1>
          </div>
          {state === "running" && (
            <span
              className="text-xs font-mono tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
              {completedCount}/{PROBES.length} probes
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10 flex gap-8">
        {/* Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20 space-y-5">
            {/* How it works */}
            <div
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                How it works
              </h3>
              <ul className="space-y-2.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <li className="flex gap-2">
                  <span style={{ color: "var(--accent)" }}>1.</span>
                  <span>Sends {PROBES.length} lightweight prompts to the endpoint to probe model behavior</span>
                </li>
                <li className="flex gap-2">
                  <span style={{ color: "var(--accent)" }}>2.</span>
                  <span>Analyzes tokenizer patterns, formatting style, knowledge cutoff, and instruction adherence</span>
                </li>
                <li className="flex gap-2">
                  <span style={{ color: "var(--accent)" }}>3.</span>
                  <span>Scores responses against known fingerprints for each model family</span>
                </li>
                <li className="flex gap-2">
                  <span style={{ color: "var(--accent)" }}>4.</span>
                  <span>Reports whether the endpoint serves the model it claims to be</span>
                </li>
              </ul>
            </div>

            {/* Security notice */}
            <div
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--success-border)", background: "var(--success-bg)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--success)" }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--success)" }}
                >
                  Your key is safe
                </h3>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Everything runs client-side in your browser. Your API key is never sent to our servers
                &mdash; it goes directly from your browser to the API endpoint you specify.
              </p>
              <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
                We still recommend using <strong>temporary or scoped keys</strong> whenever
                possible, as a general best practice.
              </p>
            </div>

            {/* What it detects */}
            <div
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                What it detects
              </h3>
              <div className="space-y-1.5">
                {[
                  "Model family imposters",
                  "Tokenizer mismatches",
                  "Proxy re-routing",
                  "Knowledge cutoff drift",
                  "Behavioral fingerprint shifts",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Open source */}
            <a
              href="https://github.com/wavedigitalweb/ai-model-claim-verifier"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border p-5 transition-colors hover:border-gray-400"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--text)" }}>
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text)" }}
                >
                  Open Source
                </h3>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                All probe logic and scoring is fully transparent. Review exactly how we fingerprint
                models on GitHub.
              </p>
              <p className="text-xs mt-2 font-mono" style={{ color: "var(--accent)" }}>
                wavedigitalweb/ai-model-claim-verifier →
              </p>
            </a>
          </div>
        </aside>

      <main className="flex-1 min-w-0">
        {/* Intro */}
        {state === "idle" && (
          <div className="mb-10 animate-fade-in">
            <h2
              className="text-2xl font-semibold tracking-tight mb-2"
              style={{ color: "var(--text)" }}
            >
              Verify your LLM endpoint
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Runs {PROBES.length} diagnostic probes against an OpenAI-compatible API to fingerprint
              the actual model family behind the endpoint. All checks run client-side in your browser.
            </p>
          </div>
        )}

        {/* Form */}
        {(state === "idle" || state === "running") && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  API Base URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                  disabled={state === "running"}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm font-mono transition-colors outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-... (optional)"
                  disabled={state === "running"}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm font-mono transition-colors outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Claimed Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-5.4"
                  disabled={state === "running"}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm font-mono transition-colors outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              {state === "idle" ? (
                <button
                  onClick={handleRun}
                  disabled={!url.trim() || !model.trim()}
                  className="rounded-lg px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:opacity-80"
                  style={{
                    background: "var(--accent)",
                    color: "var(--bg)",
                  }}
                >
                  Run Verification
                </button>
              ) : (
                <button
                  onClick={handleCancel}
                  className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer hover:opacity-80"
                  style={{
                    borderColor: "var(--border-strong)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress */}
        {state === "running" && (
          <div className="space-y-1 mb-8 animate-fade-in">
            {/* Progress bar */}
            <div className="mb-5">
              <div
                className="h-1 w-full rounded-full overflow-hidden"
                style={{ background: "var(--bg-muted)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${(completedCount / PROBES.length) * 100}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
            {progress.map((p) => (
              <div
                key={p.probeName}
                className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors"
                style={{
                  background: p.status === "running" ? "var(--bg-subtle)" : "transparent",
                }}
              >
                <StatusDot status={p.status} />
                <span
                  className="text-sm font-medium flex-1"
                  style={{
                    color:
                      p.status === "running"
                        ? "var(--text)"
                        : p.status === "error"
                          ? "var(--error)"
                          : "var(--text-tertiary)",
                  }}
                >
                  {p.probeLabel}
                </span>
                {p.result && "elapsed_ms" in p.result && (
                  <span
                    className="text-xs font-mono tabular-nums"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {p.result.elapsed_ms}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && state === "done" && (
          <div
            className="rounded-lg border p-4 mb-8 animate-slide-up"
            style={{
              background: "var(--error-bg)",
              borderColor: "var(--error-border)",
            }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--error)" }}>
              Verification failed
            </p>
            <p className="text-xs mt-1 font-mono" style={{ color: "var(--error)" }}>
              {error}
            </p>
          </div>
        )}

        {/* Results */}
        {state === "done" && verdict && (
          <div className="animate-slide-up">
            {/* Verdict card */}
            <div
              className="rounded-xl border p-6 mb-6"
              style={{
                background: verdict.match ? "var(--success-bg)" : "var(--error-bg)",
                borderColor: verdict.match ? "var(--success-border)" : "var(--error-border)",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-secondary)" }}>
                    Detected Family
                  </p>
                  <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>
                    {getFamilyName(verdict.verdict)}
                  </p>
                </div>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: verdict.match ? "var(--success)" : "var(--error)",
                    color: "#fff",
                  }}
                >
                  {verdict.match ? "MATCH" : "MISMATCH"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Claimed</p>
                  <p className="font-mono font-medium mt-0.5" style={{ color: "var(--text)" }}>{model}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Confidence</p>
                  <p className="font-medium mt-0.5" style={{ color: "var(--text)" }}>
                    <ConfidenceBadge confidence={verdict.confidence} />
                  </p>
                </div>
              </div>
            </div>

            {/* Score breakdown */}
            <div
              className="rounded-xl border p-6 mb-6"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              <h3 className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>
                Score Breakdown
              </h3>
              <div className="space-y-3">
                {Object.entries(verdict.scores).map(([family, score], i) => {
                  const maxScore = Math.max(...Object.values(verdict.scores), 1)
                  return (
                    <div key={family} className="animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm" style={{ color: family === verdict.verdict ? "var(--text)" : "var(--text-secondary)" }}>
                          {getFamilyName(family)}
                        </span>
                        <span className="text-sm font-mono tabular-nums font-medium" style={{ color: "var(--text)" }}>
                          {score}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
                        <div
                          className="h-full rounded-full animate-bar-fill"
                          style={{
                            width: `${maxScore > 0 ? (score / maxScore) * 100 : 0}%`,
                            background: family === verdict.verdict ? "var(--accent)" : "var(--border-strong)",
                            animationDelay: `${i * 60 + 200}ms`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Probe details */}
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              <h3
                className="text-xs font-medium uppercase tracking-wider px-6 py-4 border-b"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
              >
                Probe Details
              </h3>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {results &&
                  Object.entries(results).map(([name, data]) => (
                    <ProbeDetail key={name} name={name} data={data} />
                  ))}
              </div>
            </div>

            {/* Reset button */}
            <div className="mt-8 flex justify-center">
              <button
                onClick={handleReset}
                className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer hover:opacity-80"
                style={{
                  borderColor: "var(--border-strong)",
                  color: "var(--text-secondary)",
                }}
              >
                Run Another Check
              </button>
            </div>
          </div>
        )}
      </main>
      </div>

      {/* Footer */}
      <footer className="border-t mt-auto" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto max-w-5xl px-6 py-4">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            All probes run client-side. Your API key never leaves your browser. Use temporary keys when possible.
          </p>
        </div>
      </footer>
    </div>
  )
}

function StatusDot({ status }: { status: "running" | "done" | "error" }) {
  if (status === "running") {
    return (
      <div className="relative flex h-2.5 w-2.5">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-pulse-subtle"
          style={{ background: "var(--warning)" }}
        />
        <span
          className="relative inline-flex rounded-full h-2.5 w-2.5"
          style={{ background: "var(--warning)" }}
        />
      </div>
    )
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: status === "done" ? "var(--success)" : "var(--error)",
      }}
    />
  )
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const colors = {
    high: { bg: "var(--success-bg)", color: "var(--success)", border: "var(--success-border)" },
    medium: { bg: "var(--warning-bg)", color: "var(--warning)", border: "var(--warning-border)" },
    low: { bg: "var(--error-bg)", color: "var(--error)", border: "var(--error-border)" },
  }
  const c = colors[confidence]
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide"
      style={{ background: c.bg, color: c.color, borderColor: c.border }}
    >
      {confidence}
    </span>
  )
}

function ProbeDetail({ name, data }: { name: string; data: ProbeOutcome }) {
  const probe = PROBES.find((p) => p.name === name)

  return (
    <div className="px-6 py-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: data.kind === "error" ? "var(--error)" : "var(--success)" }}
          />
          <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {probe?.label ?? name}
          </span>
        </div>
        <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          {data.elapsed_ms}ms
        </span>
      </div>

      {data.kind === "error" ? (
        <p className="text-xs font-mono pl-3.5" style={{ color: "var(--error)" }}>
          {data.error}
        </p>
      ) : (
        <div className="space-y-1.5 pl-3.5">
          {Object.entries(data.fields).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
                {k}:
              </span>
              <span className="font-mono break-all" style={{ color: "var(--text-secondary)" }}>
                {String(v).slice(0, 150)}
              </span>
            </div>
          ))}
          {Object.keys(data.signals).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(data.signals).map(([k, v]) => {
                if (!v || v === "unknown" || v === "ambiguous") return null
                return (
                  <span
                    key={k}
                    className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {k}={String(v)}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
