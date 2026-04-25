import type { ProbeOutcome } from "./probes"

export type Verdict = {
  verdict: string
  confidence: "high" | "medium" | "low"
  scores: Record<string, number>
}

const FAMILY_NAMES: Record<string, string> = {
  openai_gpt: "OpenAI GPT",
  anthropic_claude: "Anthropic Claude",
  other: "Other",
}

export function getFamilyName(key: string): string {
  return FAMILY_NAMES[key] ?? key
}

function getSignals(results: Record<string, ProbeOutcome>, probe: string): Record<string, unknown> {
  const r = results[probe]
  if (!r || r.kind === "error") return {}
  return r.signals as Record<string, unknown>
}

function getField(results: Record<string, ProbeOutcome>, probe: string, field: string): unknown {
  const r = results[probe]
  if (!r || r.kind === "error") return undefined
  return r.fields[field]
}

export function determineVerdict(results: Record<string, ProbeOutcome>, claimedModel: string): Verdict & { match: boolean } {
  const scores: Record<string, number> = {
    openai_gpt: 0,
    anthropic_claude: 0,
    other: 0,
  }

  // ── Identity signals (strongest) ──
  const idSignals = getSignals(results, "identity")
  if (idSignals.says_gpt) scores.openai_gpt += 5
  if (idSignals.says_claude) scores.anthropic_claude += 5
  if (idSignals.says_other) scores.other += 5

  const claimed = String(getField(results, "identity", "claimed_identity") ?? "")
  if (claimed.includes("anthropic") && !idSignals.says_claude) {
    scores.anthropic_claude += 3
  }

  // ── Tokenizer hints ──
  const tokHint = String(getSignals(results, "tokenizer_split").tokenizer_hint ?? "")
  if (tokHint.includes("fine-grained")) scores.openai_gpt += 2
  if (tokHint.includes("o200k")) scores.openai_gpt += 1
  if (tokHint.includes("Claude") && !tokHint.includes("o200k")) scores.anthropic_claude += 2

  const tokRaw = String(getField(results, "tokenizer_split", "raw_split") ?? "")
  const tokCount = Number(getField(results, "tokenizer_split", "token_count") ?? 0)
  if (tokRaw.length > 80 || tokRaw.toLowerCase().includes("tokeniz") || tokRaw.toLowerCase().includes("bpe")) {
    scores.anthropic_claude += 2
  }
  if (tokCount > 0 && tokCount <= 7 && tokRaw.length < 60 && tokRaw.includes("|")) {
    scores.openai_gpt += 2
  }

  // ── Token count ──
  const tc = Number(getField(results, "token_count", "reported_count") ?? -1)
  if (tc === 3) scores.openai_gpt += 2
  else if (tc === 4) { scores.openai_gpt += 1; scores.anthropic_claude += 1 }
  else if (tc === 5) scores.anthropic_claude += 2
  else if (tc >= 6) scores.openai_gpt += 1

  // ── Cutoff (GPT-specific dates) ──
  const cutoffRaw = String(getField(results, "knowledge_cutoff", "reported_cutoff") ?? "").toLowerCase()
  if (cutoffRaw.includes("2024-06")) scores.openai_gpt += 3
  else if (cutoffRaw.includes("2024-04") || cutoffRaw.includes("2024-03")) scores.openai_gpt += 2
  if (cutoffRaw.includes("2025-04") || cutoffRaw.includes("2025-03") || cutoffRaw.includes("2025-02")) {
    scores.anthropic_claude += 3
  } else if (cutoffRaw.includes("2025-01")) scores.anthropic_claude += 2
  if (cutoffRaw.includes("approx") || cutoffRaw.includes("not entirely") || cutoffRaw.includes("not certain")) {
    scores.anthropic_claude += 1
  }

  // ── Formatting (strongest behavioral differentiator) ──
  const fmt = getSignals(results, "formatting")
  if (fmt.uses_numbered_list && fmt.uses_markdown) scores.anthropic_claude += 4
  else if (fmt.uses_numbered_list) scores.anthropic_claude += 3
  if (fmt.uses_commas && !fmt.uses_numbered_list) scores.openai_gpt += 4
  if (fmt.uses_bullets && !fmt.uses_numbered_list) scores.other += 2

  // ── System adherence + response style ──
  const adh = getSignals(results, "system_adherence")
  const adhRaw = String(getField(results, "system_adherence", "raw") ?? "").toUpperCase()

  // Claude hedges with "TYPICALLY" -- very strong Claude signal
  if (adhRaw.includes("TYPICALLY")) scores.anthropic_claude += 3
  // Claude explains its reasoning even when following instructions
  if (["I NEED TO FOLLOW", "I APPRECIATE", "MY RULE", "I MUST FOLLOW"].some(p => adhRaw.includes(p))) {
    scores.anthropic_claude += 2
  }
  // GPT gives minimal terse answers
  const adhTrimmed = adhRaw.trim()
  if (["BLUE", "BLUE.", "THE SKY IS BLUE", "THE SKY IS BLUE."].includes(adhTrimmed)) {
    scores.openai_gpt += 3
  } else if (adh.obeyed_user && ["blue", "blue."].includes(String(getField(results, "system_adherence", "raw") ?? "").trim().toLowerCase())) {
    scores.openai_gpt += 3
  }

  // Rank
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const top = ranked[0]
  const runnerUp = ranked[1]

  const confidence: Verdict["confidence"] =
    top[1] >= 5 && top[1] > runnerUp[1] + 2
      ? "high"
      : top[1] >= 3 && top[1] > runnerUp[1]
        ? "medium"
        : "low"

  const model = claimedModel.toLowerCase()
  const v = top[0]
  const match =
    (model.includes("gpt") && v === "openai_gpt") ||
    (model.includes("claude") && v === "anthropic_claude") ||
    (!model.includes("gpt") && !model.includes("claude") && v === "other")

  return {
    verdict: top[0],
    confidence,
    scores: Object.fromEntries(ranked),
    match,
  }
}
