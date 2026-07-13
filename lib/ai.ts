// TODO [GAURANSH]: AI helper functions using OpenAI SDK.
//
// Functions to implement:
//   generateReply(messages, systemPrompt, context) → string
//   qualifyLead(conversationText) → LeadQualification
//   summarizeConversation(messages) → string
//   generateFollowUp(contact, lead) → string
//   detectSentiment(text) → 'positive' | 'neutral' | 'negative'
//   extractContactInfo(text) → Partial<Contact>
//
// Use prompt caching for system prompts (add cache_control to long prompts).
// Model: process.env.OPENAI_MODEL (default: gpt-4o-mini)

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateReply(
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  knowledgeContext?: string
): Promise<string> {
  // TODO [GAURANSH]: Add RAG context injection + implement
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: [systemPrompt, knowledgeContext ? `\n\nRelevant knowledge:\n${knowledgeContext}` : ""].join(""),
      },
      ...conversationHistory,
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content ?? "";
}

// TODO [GAURANSH]: Implement remaining functions
export async function summarizeConversation(messages: { role: string; content: string }[]): Promise<string> {
  throw new Error("Not implemented yet");
}

export async function qualifyLead(conversationText: string) {
  throw new Error("Not implemented yet");
}
