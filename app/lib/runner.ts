import { PROBES, type ProbeOutcome } from "./probes"

export type ProbeProgress = {
  probeName: string
  probeLabel: string
  status: "running" | "done" | "error"
  result?: ProbeOutcome
}

type CallModelParams = {
  url: string
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
}

async function callModel({ url, apiKey, model, systemPrompt, userPrompt }: CallModelParams): Promise<string> {
  const messages: Array<{ role: string; content: string }> = []
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt })
  messages.push({ role: "user", content: userPrompt })

  const base = url.replace(/\/chat\/completions\/?$/, "")
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 300,
      temperature: 0,
    }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 300)}`)
  }

  const data = await resp.json()
  return data.choices?.[0]?.message?.content ?? ""
}

export async function runProbes(
  url: string,
  apiKey: string,
  model: string,
  onProgress: (progress: ProbeProgress[]) => void,
  signal?: AbortSignal,
): Promise<Record<string, ProbeOutcome>> {
  const cleanUrl = url.replace(/\/+$/, "")
  const results: Record<string, ProbeOutcome> = {}
  const progressList: ProbeProgress[] = PROBES.map((p) => ({
    probeName: p.name,
    probeLabel: p.label,
    status: "running" as const,
  }))

  // Run probes sequentially so the UI shows clear step-by-step progress
  for (let i = 0; i < PROBES.length; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

    const probe = PROBES[i]
    const spec = probe.getSpec()

    progressList[i] = { ...progressList[i], status: "running" }
    onProgress([...progressList])

    const start = performance.now()
    try {
      const text = await callModel({
        url: cleanUrl,
        apiKey,
        model,
        systemPrompt: spec.system,
        userPrompt: spec.user,
      })
      const elapsed = Math.round(performance.now() - start)
      const analysis = spec.analyze(text)
      results[probe.name] = {
        kind: "result",
        signals: analysis.signals,
        elapsed_ms: elapsed,
        fields: Object.fromEntries(
          Object.entries(analysis).filter(([k]) => k !== "signals")
        ),
      }
      progressList[i] = { ...progressList[i], status: "done", result: results[probe.name] }
    } catch (err) {
      const elapsed = Math.round(performance.now() - start)
      const msg = err instanceof Error ? err.message : String(err)
      results[probe.name] = { kind: "error", error: msg, elapsed_ms: elapsed }
      progressList[i] = { ...progressList[i], status: "error", result: results[probe.name] }
    }
    onProgress([...progressList])
  }

  return results
}
