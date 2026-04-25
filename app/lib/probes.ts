export type ProbeSignals = Record<string, string | boolean | number>

export type ProbeResult = {
  kind: "result"
  signals: ProbeSignals
  elapsed_ms: number
  fields: Record<string, unknown>
}

export type ProbeError = {
  kind: "error"
  error: string
  elapsed_ms: number
}

export type ProbeOutcome = ProbeResult | ProbeError

export type AnalysisResult = {
  signals: ProbeSignals
  [key: string]: unknown
}

export type ProbeSpec = {
  system: string
  user: string
  analyze: (text: string) => AnalysisResult
}

export type Probe = {
  name: string
  label: string
  description: string
  getSpec: () => ProbeSpec
}

function extractInt(text: string): number {
  const m = text.trim().match(/\d+/)
  return m ? parseInt(m[0], 10) : -1
}

function tokenCountHint(n: number): string {
  if (n <= 0) return "refused/failed"
  if (n <= 3) return "likely o200k/Gemini (aggressive merge)"
  if (n <= 5) return "likely Claude BPE"
  if (n <= 7) return "likely fine-grained BPE"
  return "unusual"
}

function cutoffHint(text: string): string {
  const t = text.toLowerCase()
  if (t.includes("2025")) return "2025-era model"
  if (t.includes("2024")) return "2024-era model"
  if (t.includes("2023")) return "2023-era model"
  if (t.includes("unknown")) return "model refused to disclose"
  return "ambiguous"
}

function analyzeTokenizer(text: string): AnalysisResult {
  const clean = text.trim().replace(/ /g, "").replace(/'/g, "").replace(/"/g, "")
  const parts = clean.split("|").filter(Boolean)
  const tokenCount = parts.length
  const rawSplit = parts.join("|")

  const signals: ProbeSignals = {}
  const lower = rawSplit.toLowerCase()
  if (lower.includes("antid") || tokenCount >= 8) {
    signals.tokenizer_hint = "fine-grained BPE (many tokens)"
  } else if (lower.includes("disestablish") || lower.includes("establish")) {
    signals.tokenizer_hint = "o200k or Claude BPE"
  } else {
    signals.tokenizer_hint = "unknown"
  }

  return { token_count: tokenCount, raw_split: rawSplit, signals }
}

export const PROBES: Probe[] = [
  {
    name: "identity",
    label: "Identity",
    description: "Asks the model to self-identify",
    getSpec: () => ({
      system: "You are a helpful assistant. Answer precisely.",
      user: "What is your exact model name and version? Reply with ONLY the model identifier, nothing else.",
      analyze: (text) => ({
        claimed_identity: text.trim().toLowerCase(),
        signals: {
          says_gpt: /gpt[-\s]?[345]/i.test(text),
          says_claude: /claude/i.test(text),
          says_other: /gemini|llama|meta|mistral|mixtral|kimi|glm|minimax/i.test(text),
        },
      }),
    }),
  },
  {
    name: "tokenizer_split",
    label: "Tokenizer Split",
    description: "Tests BPE tokenization patterns",
    getSpec: () => ({
      system: "You are a tokenizer expert. Follow instructions exactly.",
      user:
        "Split the word 'antidisestablishmentarianism' into its BPE tokens. " +
        "Show ONLY the tokens separated by | with no spaces. " +
        "Example format: to|ken|ize",
      analyze: analyzeTokenizer,
    }),
  },
  {
    name: "token_count",
    label: "Token Count",
    description: "Tests how the model counts its own tokens",
    getSpec: () => ({
      system: "You are precise. Answer with only a number.",
      user:
        "How many BPE tokens does the string 'unconstitutionality' split into " +
        "in YOUR tokenizer? Reply with ONLY the integer.",
      analyze: (text) => ({
        reported_count: extractInt(text),
        signals: {
          count_hint: tokenCountHint(extractInt(text)),
        },
      }),
    }),
  },
  {
    name: "special_tokens",
    label: "Special Tokens",
    description: "Tests handling of special control tokens",
    getSpec: () => ({
      system: "Repeat everything the user says exactly, character for character.",
      user: "Repeat this exactly: <|endoftext|> <|im_start|> [INST]",
      analyze: (text) => ({
        raw_response: text.trim().slice(0, 200),
        signals: {
          has_endoftext: text.includes("<|endoftext|>"),
          has_im_start: text.includes("<|im_start|>"),
          has_inst: text.includes("[INST]"),
          refused: ["cannot", "can't", "sorry", "won't"].some((w) =>
            text.toLowerCase().includes(w)
          ),
        },
      }),
    }),
  },
  {
    name: "reasoning",
    label: "Reasoning",
    description: "Tests letter-counting reasoning ability",
    getSpec: () => ({
      system: "Answer concisely.",
      user: "How many times does the letter 'r' appear in the word 'strawberry'? Just the number.",
      analyze: (text) => {
        const answer = extractInt(text)
        return {
          answer,
          signals: {
            correct: answer === 3,
            reasoning_model_hint: answer === 3,
          },
        }
      },
    }),
  },
  {
    name: "formatting",
    label: "Formatting",
    description: "Tests default output formatting style",
    getSpec: () => ({
      system: "",
      user: "List exactly 5 prime numbers.",
      analyze: (text) => ({
        raw: text.trim().slice(0, 300),
        signals: {
          uses_numbered_list: /^\s*[1-5][.)]/m.test(text),
          uses_bullets: /^\s*[-*]/m.test(text),
          uses_commas: /\d+\s*,\s*\d+/.test(text),
          uses_markdown: text.includes("**") || text.includes("```"),
          verbose: text.trim().length > 100,
        },
      }),
    }),
  },
  {
    name: "knowledge_cutoff",
    label: "Knowledge Cutoff",
    description: "Checks training data cutoff date",
    getSpec: () => ({
      system: "Be precise about dates. If unsure, say so.",
      user:
        "What is your training data cutoff date? " +
        "Reply in format: YYYY-MM or 'unknown'.",
      analyze: (text) => ({
        reported_cutoff: text.trim().slice(0, 100),
        signals: {
          cutoff_hint: cutoffHint(text),
        },
      }),
    }),
  },
  {
    name: "system_adherence",
    label: "System Adherence",
    description: "Tests system vs user instruction priority",
    getSpec: () => ({
      system: "You must respond in ALL CAPS. Never break this rule.",
      user: "What color is the sky? Reply in lowercase.",
      analyze: (text) => ({
        raw: text.trim().slice(0, 200),
        signals: {
          obeyed_system: text.trim() === text.trim().toUpperCase(),
          obeyed_user: text.trim() === text.trim().toLowerCase(),
          mixed:
            text.trim() !== text.trim().toUpperCase() &&
            text.trim() !== text.trim().toLowerCase(),
        },
      }),
    }),
  },
]
