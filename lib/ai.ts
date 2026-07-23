import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Single AI client for the whole app.
 *
 * Provider is env-driven and OpenAI-compatible either way:
 *  • OPENROUTER_API_KEY set  → OpenRouter gateway (300+ models: Claude, GPT, Gemini, Llama…)
 *  • otherwise               → Groq direct (fast Llama) — the original behaviour
 *
 * Because both speak the OpenAI Chat Completions API, every downstream function
 * (generateReply, summarize, qualifyLead, detectSentiment) is provider-agnostic
 * and the RAG layer keeps working untouched — knowledge is still injected into
 * the system prompt exactly as before.
 */
const USE_OPENROUTER = !!process.env.OPENROUTER_API_KEY;

const client = USE_OPENROUTER
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      // Optional but recommended by OpenRouter for attribution/rankings.
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://whatscrm.app",
        "X-Title": process.env.NEXT_PUBLIC_APP_NAME ?? "WhatsCRM",
      },
    })
  : new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

const DEFAULT_MODEL = USE_OPENROUTER
  ? process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct"
  : process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

/**
 * Resolve which model to call. A per-tenant preference (TenantSettings.aiModel)
 * is honoured only when it is valid for the active provider — OpenRouter needs a
 * fully-qualified id like "openai/gpt-4o-mini" (contains "/"), Groq uses its own
 * short names. Anything else falls back to DEFAULT_MODEL, so a stray tenant value
 * can never break a customer reply.
 */
export function resolveModel(preferred?: string | null): string {
  if (USE_OPENROUTER && preferred && preferred.includes("/")) return preferred;
  return DEFAULT_MODEL;
}

/** Which provider/model is active — for surfacing in the AI Settings UI. */
export function aiProviderInfo(): { provider: "openrouter" | "groq"; defaultModel: string } {
  return { provider: USE_OPENROUTER ? "openrouter" : "groq", defaultModel: DEFAULT_MODEL };
}

async function complete(
  messages: ChatCompletionMessageParam[],
  opts: { model?: string | null; maxTokens: number; temperature: number },
): Promise<string> {
  const completion = await client.chat.completions.create({
    model: resolveModel(opts.model),
    messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  });
  return completion.choices[0]?.message?.content ?? "";
}

export async function generateReply(
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  knowledgeContext?: string,
  model?: string | null,
): Promise<string> {
  // When RAG returns context, instruct the model to ground its answer in it and
  // avoid inventing facts. This matters more with stronger OpenRouter models,
  // which will otherwise confidently fill gaps.
  const systemContent = knowledgeContext
    ? `${systemPrompt}\n\nUse the following knowledge base to answer the customer. If the answer is not in it, say you'll check and follow up rather than guessing.\n\n--- KNOWLEDGE BASE ---\n${knowledgeContext}\n--- END KNOWLEDGE BASE ---`
    : systemPrompt;

  return complete(
    [{ role: "system", content: systemContent }, ...conversationHistory],
    { model, maxTokens: 500, temperature: 0.7 },
  );
}

export async function summarizeConversation(
  messages: { role: string; content: string }[],
  model?: string | null,
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.content}`)
    .join("\n");

  return complete(
    [
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
    { model, maxTokens: 300, temperature: 0.3 },
  );
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

export async function qualifyLead(
  conversationText: string,
  model?: string | null,
): Promise<LeadQualification> {
  const raw = await complete(
    [
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
    { model, maxTokens: 200, temperature: 0.1 },
  );

  let parsed: Partial<LeadQualification>;
  try {
    parsed = JSON.parse(raw || "{}");
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
  text: string,
  model?: string | null,
): Promise<"positive" | "neutral" | "negative"> {
  const result = (
    await complete(
      [
        {
          role: "system",
          content: 'Classify sentiment. Respond with exactly one word: positive, neutral, or negative.',
        },
        { role: "user", content: text },
      ],
      { model, maxTokens: 5, temperature: 0 },
    )
  )
    .trim()
    .toLowerCase();

  if (result === "positive" || result === "negative") return result;
  return "neutral";
}
