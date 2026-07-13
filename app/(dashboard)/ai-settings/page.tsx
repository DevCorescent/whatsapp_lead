"use client";

import { useState, type ReactNode } from "react";
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
} from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Field,
  Modal,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/utils";

// TODO [GAURANSH]: PATCH /api/settings/ai — persist this form into TenantSettings.

const MODELS = [
  { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile — best quality" },
  { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant — fastest, cheapest" },
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

const DEFAULT_PROMPT = `You are a helpful WhatsApp sales assistant for our business.
Answer in the customer's language, keep replies under 3 sentences, and always end with a question that moves the conversation forward.
If you don't know an answer, say so and offer to connect a human agent.`;

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

const INITIAL = {
  aiEnabled: true,
  model: MODELS[0].value,
  temperature: 0.7,
  maxTokens: 512,
  autoReply: true,
  replyDelay: 3,
  offHoursOnly: false,
  personality: PERSONALITIES[0],
  systemPrompt: DEFAULT_PROMPT,
  timezone: "Asia/Kolkata",
  startTime: "09:00",
  endTime: "18:00",
  businessDays: [1, 2, 3, 4, 5],
  offHoursMessage:
    "Thanks for reaching out! Our team is offline right now — we'll reply first thing during business hours.",
};

export default function AISettingsPage() {
  const [form, setForm] = useState(INITIAL);
  const [testOpen, setTestOpen] = useState(false);

  const set = <K extends keyof typeof INITIAL>(key: K, value: (typeof INITIAL)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = JSON.stringify(form) !== JSON.stringify(INITIAL);

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
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
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

          <Field label="System prompt" htmlFor="ai-prompt">
            <textarea
              id="ai-prompt"
              rows={8}
              maxLength={PROMPT_LIMIT}
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              className={cn(inputClass, "resize-y font-mono text-xs leading-relaxed")}
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-slate-500">Prepended to every AI conversation.</p>
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {dirty ? "You have unsaved changes." : "All changes saved."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!dirty} onClick={() => setForm(INITIAL)}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              disabled={!dirty}
              onClick={() => {
                // TODO [GAURANSH]: PATCH /api/settings/ai
              }}
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
        model={form.model}
      />
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
