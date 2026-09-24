"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Reply,
  MessageSquareQuote,
  Clock4,
  RotateCcw,
  Save,
  FlaskConical,
  Bot,
  User,
  ListChecks,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Field,
  Modal,
  PageHeader,
  inputClass,
  selectClass,
} from "@/components/ui";
import { Toggle } from "@/components/ui/Toggle";
import {
  DEFAULT_INSTRUCTIONS,
  FIELD_LABELS,
  LANGUAGES,
  LENGTHS,
  MODES,
  REPETITIONS,
  TONES,
  buildSystemPrompt,
  missingFields,
  parseInstructions,
  type AiInstructions,
  type InstructionOption,
} from "@/lib/aiInstructions";
import { cn } from "@/lib/utils";

// OpenRouter model ids (provider/model). "" = defer to the workspace default
// (OPENROUTER_MODEL). Browse more at https://openrouter.ai/models and paste the id.
const MODELS = [
  { value: "", label: "Workspace default" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o mini — fast & cheap" },
  { value: "openai/gpt-4o", label: "GPT-4o — high quality" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet — best reasoning" },
  { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash — fast, long context" },
  { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B — balanced" },
  { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free) — rate-limited" },
];

const PERSONALITIES = ["Professional", "Friendly", "Concise", "Consultative"];

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

const WEEKDAYS = [
  { value: 1, label: "M", full: "Monday" },
  { value: 2, label: "T", full: "Tuesday" },
  { value: 3, label: "W", full: "Wednesday" },
  { value: 4, label: "T", full: "Thursday" },
  { value: 5, label: "F", full: "Friday" },
  { value: 6, label: "S", full: "Saturday" },
  { value: 0, label: "S", full: "Sunday" },
];

// The free-text prompt is now *additional* instructions — everything it used to have to say about
// language, length and fallback is a mandatory field in the Initial Instructions card above it, so
// the default here is empty rather than a paragraph that would duplicate (and contradict) them.
const DEFAULT_PROMPT = "";

const PROMPT_LIMIT = 2000;

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const sliderClass = "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600";

/** A required select, rendered from one of the option tables in lib/aiInstructions. */
function InstructionSelect({
  id,
  label,
  options,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  options: InstructionOption[];
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <Field label={label} htmlFor={id} required error={error}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(selectClass, error && "ring-rose-400 focus:ring-rose-500")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.hint ? ` — ${o.hint}` : ""}
          </option>
        ))}
      </select>
      {/* The directive is what actually reaches the model, so it is shown rather than
          paraphrased — the setting and its effect stay the same sentence. */}
      {selected && <p className="mt-1 text-xs text-slate-500">{selected.directive}</p>}
    </Field>
  );
}

const INITIAL = {
  aiEnabled: true,
  model: "", // "" = workspace default
  temperature: 0.7,
  maxTokens: 512,
  autoReply: true,
  replyDelay: 3,
  offHoursOnly: false,
  personality: PERSONALITIES[0],
  systemPrompt: DEFAULT_PROMPT,
  instructions: DEFAULT_INSTRUCTIONS as AiInstructions,
  timezone: "Asia/Kolkata",
  startTime: "09:00",
  endTime: "18:00",
  businessDays: [1, 2, 3, 4, 5],
  offHoursMessage:
    "Thanks for reaching out! Our team is offline right now — we'll reply first thing during business hours.",
};

export default function AISettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(INITIAL);
  const [testOpen, setTestOpen] = useState(false);

  const { data: aiData } = useQuery({
    queryKey: ["settings-ai"],
    queryFn: async () => {
      const r = await fetch("/api/settings/ai");
      const j = await r.json();
      return j.data as {
        aiEnabled: boolean; aiModel: string; autoReply: boolean;
        autoReplyDelay: number; aiPersonality: string | null;
        aiTemperature: number | null; aiMaxTokens: number | null;
        aiSystemPrompt: string | null; offHoursMessage: string | null;
        aiInstructions: unknown; businessName: string | null;
        provider: "openrouter" | "groq"; defaultModel: string;
      };
    },
  });

  // Load business-hours fields (timezone, start/end, days) from the general settings endpoint.
  const { data: generalData } = useQuery({
    queryKey: ["settings-general-hours"],
    queryFn: async () => {
      const r = await fetch("/api/settings");
      const j = await r.json();
      const d = j.data as Record<string, unknown> | undefined;
      return {
        timezone: typeof d?.timezone === "string" ? d.timezone : null,
        businessHoursStart: typeof d?.businessHoursStart === "string" ? d.businessHoursStart : null,
        businessHoursEnd: typeof d?.businessHoursEnd === "string" ? d.businessHoursEnd : null,
        businessDays: Array.isArray(d?.businessDays) ? (d!.businessDays as number[]) : null,
      };
    },
  });

  // Seeded during render rather than in an effect, the same way the team modal
  // re-seeds (app/(dashboard)/team/page.tsx). Two reasons it matters here:
  // an effect paints the defaults for one frame and then corrects them, and it
  // re-runs on every refetch — so a background refetch would throw away whatever
  // the user had typed but not yet saved. The sentinels make each payload seed
  // the form exactly once; everything after that is the user's to edit.
  const [seededAi, setSeededAi] = useState(false);
  if (aiData && !seededAi) {
    setSeededAi(true);
    setForm((f) => ({
      ...f,
      aiEnabled: aiData.aiEnabled,
      model: aiData.aiModel?.includes("/") ? aiData.aiModel : "",
      autoReply: aiData.autoReply,
      replyDelay: aiData.autoReplyDelay,
      personality: aiData.aiPersonality ?? f.personality,
      temperature: aiData.aiTemperature ?? f.temperature,
      maxTokens: aiData.aiMaxTokens ?? f.maxTokens,
      systemPrompt: aiData.aiSystemPrompt ?? f.systemPrompt,
      // A business that has never saved the structured fields comes back null; it starts on the
      // defaults, which are themselves a complete valid set, so the form is never in the
      // "mandatory field is empty" state just because nobody has visited this page yet.
      instructions: parseInstructions(aiData.aiInstructions) ?? f.instructions,
      offHoursMessage: aiData.offHoursMessage ?? f.offHoursMessage,
    }));
  }

  const [seededHours, setSeededHours] = useState(false);
  if (generalData && !seededHours) {
    setSeededHours(true);
    setForm((f) => ({
      ...f,
      timezone: generalData.timezone ?? f.timezone,
      startTime: generalData.businessHoursStart ?? f.startTime,
      endTime: generalData.businessHoursEnd ?? f.endTime,
      businessDays: generalData.businessDays ?? f.businessDays,
    }));
  }

  // Include a saved-but-unlisted model so the dropdown still shows it.
  const modelOptions =
    form.model && !MODELS.some((m) => m.value === form.model)
      ? [{ value: form.model, label: `${form.model} (custom)` }, ...MODELS]
      : MODELS;
  const onGroq = aiData?.provider === "groq";

  const set = <K extends keyof typeof INITIAL>(key: K, value: (typeof INITIAL)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Snapshot of everything the server currently holds — used for dirty detection and Reset.
  const savedSnapshot =
    aiData && generalData
      ? {
          aiEnabled: aiData.aiEnabled,
          model: aiData.aiModel?.includes("/") ? aiData.aiModel : "",
          autoReply: aiData.autoReply,
          replyDelay: aiData.autoReplyDelay,
          personality: aiData.aiPersonality ?? INITIAL.personality,
          temperature: aiData.aiTemperature ?? INITIAL.temperature,
          maxTokens: aiData.aiMaxTokens ?? INITIAL.maxTokens,
          systemPrompt: aiData.aiSystemPrompt ?? INITIAL.systemPrompt,
          instructions: parseInstructions(aiData.aiInstructions) ?? INITIAL.instructions,
          offHoursMessage: aiData.offHoursMessage ?? INITIAL.offHoursMessage,
          timezone: generalData.timezone ?? INITIAL.timezone,
          startTime: generalData.businessHoursStart ?? INITIAL.startTime,
          endTime: generalData.businessHoursEnd ?? INITIAL.endTime,
          businessDays: generalData.businessDays ?? INITIAL.businessDays,
        }
      : null;

  const dirty = savedSnapshot
    ? form.aiEnabled !== savedSnapshot.aiEnabled ||
      form.model !== savedSnapshot.model ||
      form.autoReply !== savedSnapshot.autoReply ||
      form.replyDelay !== savedSnapshot.replyDelay ||
      form.personality !== savedSnapshot.personality ||
      form.temperature !== savedSnapshot.temperature ||
      form.maxTokens !== savedSnapshot.maxTokens ||
      form.systemPrompt !== savedSnapshot.systemPrompt ||
      JSON.stringify(form.instructions) !== JSON.stringify(savedSnapshot.instructions) ||
      form.offHoursMessage !== savedSnapshot.offHoursMessage ||
      form.timezone !== savedSnapshot.timezone ||
      form.startTime !== savedSnapshot.startTime ||
      form.endTime !== savedSnapshot.endTime ||
      JSON.stringify(form.businessDays) !== JSON.stringify(savedSnapshot.businessDays)
    : false;

  // Every instruction field is mandatory, so this is checked here and again in the PATCH route.
  // Blocking the save is the point: a half-written instruction set is what produced the vague,
  // drifting replies this section exists to fix, and silently saving one would just move the
  // problem to the customer's chat window.
  const instructionErrors = missingFields(form.instructions);
  const instructionsValid = Object.keys(instructionErrors).length === 0;

  const setInstruction = <K extends keyof AiInstructions>(key: K, value: AiInstructions[K]) =>
    setForm((f) => ({ ...f, instructions: { ...f.instructions, [key]: value } }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!instructionsValid) {
        const names = (Object.keys(instructionErrors) as (keyof AiInstructions)[])
          .map((k) => FIELD_LABELS[k])
          .join(", ");
        throw new Error(`Complete the required instruction fields first: ${names}.`);
      }
      // Two parallel PATCHes — AI model/personality settings go to /api/settings/ai
      // (which saves to TenantSettings + Business); business-hours go to /api/settings
      // (which saves to TenantSettings). Both endpoints are idempotent.
      const [r1, r2] = await Promise.all([
        fetch("/api/settings/ai", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aiEnabled: form.aiEnabled,
            aiModel: form.model,
            autoReply: form.autoReply,
            autoReplyDelay: form.replyDelay,
            aiPersonality: form.personality,
            aiTemperature: form.temperature,
            aiMaxTokens: form.maxTokens,
            aiSystemPrompt: form.systemPrompt,
            aiInstructions: form.instructions,
            offHoursMessage: form.offHoursMessage,
          }),
        }),
        fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timezone: form.timezone,
            businessHoursStart: form.startTime,
            businessHoursEnd: form.endTime,
            businessDays: form.businessDays,
          }),
        }),
      ]);
      if (!r1.ok) { const j = await r1.json(); throw new Error(j.error ?? "Save failed"); }
      if (!r2.ok) { const j = await r2.json(); throw new Error(j.error ?? "Failed to save business hours"); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-ai"] });
      qc.invalidateQueries({ queryKey: ["settings-general-hours"] });
    },
  });

  const toggleDay = (day: number) =>
    setForm((f) => ({
      ...f,
      businessDays: f.businessDays.includes(day)
        ? f.businessDays.filter((d) => d !== day)
        : [...f.businessDays, day].sort(),
    }));

  return (
    <div className="pb-24">
      <PageHeader
        title="AI Settings"
        description="Control how the AI assistant replies to customers on WhatsApp."
      />

      {/* ── Initial Instructions (mandatory) ─────────────────────────────────
          Full width and first on the page: these are the rules every reply is
          checked against, and the cards below only tune how they are delivered. */}
      <Card className="mb-5 p-5">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <ListChecks className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">Initial Instructions</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              The rules the AI must follow on every reply. All fields are required — the more exact
              they are, the more accurate the replies.
            </p>
          </div>
        </div>

        {!instructionsValid && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-600/20">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Fill in every required field before saving:{" "}
              <strong>
                {(Object.keys(instructionErrors) as (keyof AiInstructions)[])
                  .map((k) => FIELD_LABELS[k])
                  .join(", ")}
              </strong>
              .
            </span>
          </p>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 lg:col-span-2">
            <Field
              label={FIELD_LABELS.role}
              htmlFor="ins-role"
              required
              error={instructionErrors.role}
            >
              <textarea
                id="ins-role"
                rows={3}
                maxLength={600}
                value={form.instructions.role}
                onChange={(e) => setInstruction("role", e.target.value)}
                placeholder="You are the WhatsApp assistant for …"
                className={cn(
                  inputClass,
                  "resize-y",
                  instructionErrors.role && "ring-rose-400 focus:ring-rose-500",
                )}
              />
              <p className="mt-1 text-xs text-slate-500">
                Who the assistant is and what it is allowed to speak about.
              </p>
            </Field>

            <Field
              label={FIELD_LABELS.greeting}
              htmlFor="ins-greeting"
              required
              error={instructionErrors.greeting}
            >
              <input
                id="ins-greeting"
                maxLength={300}
                value={form.instructions.greeting}
                onChange={(e) => setInstruction("greeting", e.target.value)}
                placeholder="Hi! Thanks for reaching out 👋 How can I help you today?"
                className={cn(
                  inputClass,
                  instructionErrors.greeting && "ring-rose-400 focus:ring-rose-500",
                )}
              />
              <p className="mt-1 text-xs text-slate-500">
                Sent once, on the first reply of a conversation — never repeated afterwards.
              </p>
            </Field>
          </div>

          <InstructionSelect
            id="ins-mode"
            label={FIELD_LABELS.mode}
            options={MODES}
            value={form.instructions.mode}
            error={instructionErrors.mode}
            onChange={(v) => setInstruction("mode", v)}
          />
          <InstructionSelect
            id="ins-tone"
            label={FIELD_LABELS.tone}
            options={TONES}
            value={form.instructions.tone}
            error={instructionErrors.tone}
            onChange={(v) => setInstruction("tone", v)}
          />
          <InstructionSelect
            id="ins-language"
            label={FIELD_LABELS.language}
            options={LANGUAGES}
            value={form.instructions.language}
            error={instructionErrors.language}
            onChange={(v) => setInstruction("language", v)}
          />
          <InstructionSelect
            id="ins-length"
            label={FIELD_LABELS.responseLength}
            options={LENGTHS}
            value={form.instructions.responseLength}
            error={instructionErrors.responseLength}
            onChange={(v) => setInstruction("responseLength", v)}
          />
          <div className="lg:col-span-2">
            <InstructionSelect
              id="ins-repetition"
              label={FIELD_LABELS.repetition}
              options={REPETITIONS}
              value={form.instructions.repetition}
              error={instructionErrors.repetition}
              onChange={(v) => setInstruction("repetition", v)}
            />
          </div>

          <div className="lg:col-span-2">
            <Field
              label={FIELD_LABELS.fallback}
              htmlFor="ins-fallback"
              required
              error={instructionErrors.fallback}
            >
              <textarea
                id="ins-fallback"
                rows={2}
                maxLength={400}
                value={form.instructions.fallback}
                onChange={(e) => setInstruction("fallback", e.target.value)}
                placeholder="Say you'll check with the team and offer to connect a human agent. Never guess."
                className={cn(
                  inputClass,
                  "resize-y",
                  instructionErrors.fallback && "ring-rose-400 focus:ring-rose-500",
                )}
              />
              <p className="mt-1 text-xs text-slate-500">
                Used whenever the answer is not in the knowledge base — this is what stops the AI
                inventing prices and policies.
              </p>
            </Field>
          </div>
        </div>

        <CompiledPromptPreview
          instructions={form.instructions}
          valid={instructionsValid}
          businessName={aiData?.businessName ?? null}
          additionalPrompt={form.systemPrompt}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── AI Assistant ─────────────────────────────────────────────────── */}
        <SettingsCard
          icon={Sparkles}
          title="AI Assistant"
          description="The model that drafts and sends replies."
        >
          <ToggleRow
            label="Enable AI assistant"
            hint="Turn this off to disable every AI feature at once."
            checked={form.aiEnabled}
            onChange={(v) => set("aiEnabled", v)}
          />

          <Field label="Model" htmlFor="ai-model">
            <select
              id="ai-model"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              disabled={!form.aiEnabled}
              className={cn(inputClass, "disabled:bg-slate-50 disabled:text-slate-400")}
            >
              {modelOptions.map((m) => (
                <option key={m.value || "default"} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {onGroq ? (
              <p className="mt-1 text-xs text-amber-600">
                Model selection applies when OpenRouter is enabled. This workspace is
                currently on Groq ({aiData?.defaultModel}), so all replies use that model.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                {form.model
                  ? "This workspace uses the selected model."
                  : `Defaults to ${aiData?.defaultModel ?? "the workspace model"}. Pick a specific model to override.`}
              </p>
            )}
          </Field>

          <Field label="Temperature" htmlFor="ai-temp">
            <div className="flex items-center gap-3">
              <input
                id="ai-temp"
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={form.temperature}
                disabled={!form.aiEnabled}
                onChange={(e) => set("temperature", Number(e.target.value))}
                className={sliderClass}
              />
              <span className="w-10 shrink-0 rounded-md bg-slate-100 py-0.5 text-center text-xs font-medium tabular-nums text-slate-700">
                {form.temperature.toFixed(1)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Lower is more predictable, higher is more creative.
            </p>
          </Field>

          <Field label="Max tokens" htmlFor="ai-tokens">
            <input
              id="ai-tokens"
              type="number"
              min={64}
              max={4096}
              step={64}
              value={form.maxTokens}
              disabled={!form.aiEnabled}
              onChange={(e) => set("maxTokens", Number(e.target.value))}
              className={cn(inputClass, "disabled:bg-slate-50 disabled:text-slate-400")}
            />
            <p className="mt-1 text-xs text-slate-500">Caps the length of a single reply.</p>
          </Field>
        </SettingsCard>

        {/* ── Auto-Reply ───────────────────────────────────────────────────── */}
        <SettingsCard
          icon={Reply}
          title="Auto-Reply"
          description="When the AI answers without an agent in the loop."
        >
          <ToggleRow
            label="Auto-reply to inbound messages"
            hint="The AI replies automatically as soon as a message arrives."
            checked={form.autoReply}
            onChange={(v) => set("autoReply", v)}
          />

          <Field label="Reply delay" htmlFor="ai-delay">
            <div className="flex items-center gap-3">
              <input
                id="ai-delay"
                type="range"
                min={0}
                max={30}
                step={1}
                value={form.replyDelay}
                disabled={!form.autoReply}
                onChange={(e) => set("replyDelay", Number(e.target.value))}
                className={sliderClass}
              />
              <span className="w-12 shrink-0 rounded-md bg-slate-100 py-0.5 text-center text-xs font-medium tabular-nums text-slate-700">
                {form.replyDelay}s
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              A short pause makes replies feel human rather than robotic.
            </p>
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.offHoursOnly}
              disabled={!form.autoReply}
              onChange={(e) => set("offHoursOnly", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Only outside business hours
              </span>
              <span className="block text-xs text-slate-500">
                During business hours, messages go to a human agent instead.
              </span>
            </span>
          </label>
        </SettingsCard>

        {/* ── Personality & Prompt ─────────────────────────────────────────── */}
        <SettingsCard
          icon={MessageSquareQuote}
          title="Personality & Prompt"
          description="The voice and the instructions behind every reply."
        >
          <Field label="AI personality" htmlFor="ai-personality">
            <select
              id="ai-personality"
              value={form.personality}
              onChange={(e) => set("personality", e.target.value)}
              className={inputClass}
            >
              {PERSONALITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Additional instructions" htmlFor="ai-prompt">
            <textarea
              id="ai-prompt"
              rows={8}
              maxLength={PROMPT_LIMIT}
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder={
                "Optional. Anything specific to your business that the fields above don't cover —\n" +
                "e.g. \"Always mention free delivery above ₹999.\"\n" +
                "Role, greeting, tone, language, length and repetition are set in Initial Instructions."
              }
              className={cn(inputClass, "resize-y font-mono text-xs leading-relaxed")}
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Added after the mandatory rules — it can extend them, never override them.
              </p>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  form.systemPrompt.length > PROMPT_LIMIT * 0.9
                    ? "text-amber-600"
                    : "text-slate-400",
                )}
              >
                {form.systemPrompt.length} / {PROMPT_LIMIT}
              </p>
            </div>
          </Field>

          <Button type="button" variant="secondary" onClick={() => setTestOpen(true)}>
            <FlaskConical className="h-4 w-4" />
            Test Prompt
          </Button>
        </SettingsCard>

        {/* ── Business Hours ───────────────────────────────────────────────── */}
        <SettingsCard
          icon={Clock4}
          title="Business Hours"
          description="When your human agents are available."
        >
          <Field label="Timezone" htmlFor="ai-timezone">
            <select
              id="ai-timezone"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className={inputClass}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time" htmlFor="ai-start">
              <input
                id="ai-start"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="End time" htmlFor="ai-end">
              <input
                id="ai-end"
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 block text-sm font-medium text-slate-700">Working days</p>
            <div className="flex gap-1.5">
              {WEEKDAYS.map((d, i) => {
                const on = form.businessDays.includes(d.value);
                return (
                  <button
                    key={`${d.value}-${i}`}
                    type="button"
                    aria-pressed={on}
                    aria-label={d.full}
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      "h-9 w-9 rounded-full text-sm font-medium transition",
                      on
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Off-hours auto message" htmlFor="ai-offhours">
            <textarea
              id="ai-offhours"
              rows={3}
              value={form.offHoursMessage}
              onChange={(e) => set("offHoursMessage", e.target.value)}
              className={cn(inputClass, "resize-y")}
            />
          </Field>
        </SettingsCard>
      </div>

      {/* ── Sticky save bar ────────────────────────────────────────────────── */}
      {/* lg:left-64 matches the sidebar's w-64 (16 rem). Both must change together if the sidebar width ever changes. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs">
            {saveMutation.isError ? (
              <span className="text-rose-600">
                {(saveMutation.error as Error)?.message ?? "Save failed."}
              </span>
            ) : saveMutation.isPending ? (
              <span className="text-slate-500">Saving…</span>
            ) : !instructionsValid ? (
              <span className="text-rose-600">
                {Object.keys(instructionErrors).length} required instruction field
                {Object.keys(instructionErrors).length === 1 ? "" : "s"} still to fill in.
              </span>
            ) : dirty ? (
              <span className="text-amber-600">You have unsaved changes.</span>
            ) : (
              <span className="text-emerald-600">All changes saved.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!dirty}
              onClick={() => savedSnapshot && setForm((f) => ({ ...f, ...savedSnapshot }))}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              disabled={!dirty || !instructionsValid || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      <TestPromptModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        personality={form.personality}
        model={form.model || aiData?.defaultModel || "the workspace model"}
      />
    </div>
  );
}

/**
 * The exact system prompt these fields compile to.
 *
 * Built with the same `buildSystemPrompt` the server calls, so what is shown here is what the
 * model is sent — not a description of it. It is what makes "mandatory" legible: you can see the
 * numbered rule your greeting or repetition choice turned into.
 */
function CompiledPromptPreview({
  instructions,
  valid,
  businessName,
  additionalPrompt,
}: {
  instructions: AiInstructions;
  valid: boolean;
  businessName: string | null;
  additionalPrompt: string;
}) {
  const [open, setOpen] = useState(false);
  // The greeting rule is not one rule but two, chosen per message from whether the business has
  // already spoken in that thread. Showing only one of them would misrepresent what gets sent,
  // so both are one click apart.
  const [firstReply, setFirstReply] = useState(true);

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
        >
          {open ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {open ? "Hide" : "Preview"} the instructions the AI receives
        </button>

        {open && (
          <div className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200">
            {[
              { label: "First reply", value: true },
              { label: "Later reply", value: false },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setFirstReply(tab.value)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition",
                  firstReply === tab.value
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
          {valid
            ? buildSystemPrompt(instructions, {
                businessName,
                additionalPrompt,
                isFirstReply: firstReply,
              })
            : "Complete every required field to see the compiled instructions."}
        </pre>
      )}
    </div>
  );
}

function TestPromptModal({
  open,
  onClose,
  personality,
  model,
}: {
  open: boolean;
  onClose: () => void;
  personality: string;
  model: string;
}) {
  const [draft, setDraft] = useState("");

  // Mock preview only — a real run needs POST /api/ai/reply.
  const preview = [
    { role: "user" as const, text: "Hi, how much does the Growth plan cost?" },
    {
      role: "ai" as const,
      text: "Hi Rahul! The Growth plan is ₹2,999/month and includes 10,000 contacts, 50,000 messages and AI auto-replies. Would you like me to start a 14-day free trial for you?",
    },
    { role: "user" as const, text: "Is there a discount if I pay yearly?" },
    {
      role: "ai" as const,
      text: "Yes — paying annually saves you 20%, so Growth works out to ₹2,399/month. Shall I send you the annual checkout link?",
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test Prompt"
      description={`Preview using ${model} with a ${personality.toLowerCase()} tone.`}
    >
      <div className="space-y-3 rounded-xl bg-slate-50 p-4">
        {preview.map((m, i) => (
          <div
            key={i}
            className={cn("flex items-end gap-2", m.role === "user" ? "" : "flex-row-reverse")}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-slate-200 text-slate-600" : "bg-emerald-600 text-white",
              )}
            >
              {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </span>
            <p
              className={cn(
                "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                m.role === "user"
                  ? "rounded-bl-sm bg-white text-slate-700"
                  : "rounded-br-sm bg-emerald-600 text-white",
              )}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
        This is a mock preview. Live testing needs the AI endpoint — TODO [GAURANSH]: POST
        /api/ai/reply.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={inputClass}
          placeholder="Type a customer message…"
          aria-label="Test message"
        />
        <Button type="button" disabled>
          Send
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <Avatar name="AI Assistant" size="xs" />
          Replies as your workspace assistant
        </span>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
