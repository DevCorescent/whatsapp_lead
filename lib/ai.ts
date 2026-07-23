import Groq from "groq-sdk";

// The Groq client is created lazily, not at module load. `new Groq()` throws when
// GROQ_API_KEY is unset, and constructing it at the top level made that throw fire
// during `next build`'s page-data collection (which imports every route module),
// failing the build on any deploy that supplies the key only at runtime. Deferring
// construction to first use keeps import side-effect-free; the key is still required
// before any AI call actually runs.
let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export interface GenerateReplyOptions {
  /** Overrides the default Groq model for this call (e.g. a tenant's configured model). */
  model?: string;
  /** Sampling temperature 0–2. Defaults to 0.7. */
  temperature?: number;
  /** Caps the length of the reply. Defaults to 500. */
  maxTokens?: number;
}

export async function generateReply(
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  knowledgeContext?: string,
  options?: GenerateReplyOptions
): Promise<string> {
  const systemContent = knowledgeContext
    ? `${systemPrompt}\n\nRelevant knowledge:\n${knowledgeContext}`
    : systemPrompt;

  const completion = await getGroq().chat.completions.create({
    model: options?.model ?? MODEL,
    messages: [
      { role: "system", content: systemContent },
      ...conversationHistory,
    ],
    max_tokens: options?.maxTokens ?? 500,
    temperature: options?.temperature ?? 0.7,
  });

  return completion.choices[0]?.message?.content ?? "";
}

export async function summarizeConversation(
  messages: { role: string; content: string }[]
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.content}`)
    .join("\n");

  const completion = await getGroq().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a CRM assistant. Summarize WhatsApp conversations concisely for sales agents.",
      },
      {
        role: "user",
        content: `Summarize this conversation in 3-4 bullet points. Include: customer intent, key concerns, and action items.\n\nConversation:\n${transcript}`,
      },
    ],
    max_tokens: 300,
    temperature: 0.3,
  });

  return completion.choices[0]?.message?.content ?? "";
}

export interface LeadQualification {
  bantBudget: boolean;
  bantAuthority: boolean;
  bantNeed: boolean;
  bantTimeline: boolean;
  score: number;
  scoreLabel: "COLD" | "WARM" | "HOT" | "QUALIFIED";
  reasoning: string;
}

export async function qualifyLead(conversationText: string): Promise<LeadQualification> {
  const completion = await getGroq().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          'You are a sales qualification expert using the BANT framework. Respond ONLY with valid JSON — no markdown, no explanation.',
      },
      {
        role: "user",
        content: `Analyze this WhatsApp conversation and determine BANT qualification.\n\nConversation:\n${conversationText}\n\nRespond with this exact JSON structure:\n{\n  "bantBudget": true/false,\n  "bantAuthority": true/false,\n  "bantNeed": true/false,\n  "bantTimeline": true/false,\n  "reasoning": "one sentence explanation"\n}`,
      },
    ],
    max_tokens: 200,
    temperature: 0.1,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: Partial<LeadQualification>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { bantBudget: false, bantAuthority: false, bantNeed: false, bantTimeline: false };
  }

  const bant = {
    bantBudget: parsed.bantBudget ?? false,
    bantAuthority: parsed.bantAuthority ?? false,
    bantNeed: parsed.bantNeed ?? false,
    bantTimeline: parsed.bantTimeline ?? false,
  };

  const score =
    (bant.bantBudget ? 25 : 0) +
    (bant.bantAuthority ? 25 : 0) +
    (bant.bantNeed ? 25 : 0) +
    (bant.bantTimeline ? 25 : 0);

  const scoreLabel: LeadQualification["scoreLabel"] =
    score <= 30 ? "COLD" : score <= 60 ? "WARM" : score <= 80 ? "HOT" : "QUALIFIED";

  return { ...bant, score, scoreLabel, reasoning: parsed.reasoning ?? "" };
}

export async function detectSentiment(
  text: string
): Promise<"positive" | "neutral" | "negative"> {
  const completion = await getGroq().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: 'Classify sentiment. Respond with exactly one word: positive, neutral, or negative.',
      },
      { role: "user", content: text },
    ],
    max_tokens: 5,
    temperature: 0,
  });

  const result = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? "neutral";
  if (result === "positive" || result === "negative") return result;
  return "neutral";
}
