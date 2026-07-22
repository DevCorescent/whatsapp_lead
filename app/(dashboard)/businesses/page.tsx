"use client";

import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, Check, MessageSquare, Sparkles } from "lucide-react";
import {
  Button,
  Card,
  Field,
  Modal,
  PageHeader,
  Badge,
  Skeleton,
  inputClass,
  selectClass,
} from "@/components/ui";
import { Toggle } from "@/components/ui/Toggle";
import {
  useBusinesses,
  useSwitchBusiness,
  useCreateBusiness,
  useUpdateBusiness,
  useDeleteBusiness,
  type BusinessDTO,
  type BusinessInput,
} from "@/hooks/useBusinesses";

type FormState = BusinessInput;

const EMPTY_FORM: FormState = {
  name: "",
  timezone: "Asia/Kolkata",
  whatsappPhoneNumber: "",
  whatsappPhoneNumberId: "",
  whatsappBusinessId: "",
  whatsappAccessToken: "",
  whatsappVerifyToken: "",
  aiEnabled: false,
  autoReply: false,
  aiModel: "",
  aiSystemPrompt: "",
  aiTemperature: 0.7,
  aiMaxTokens: 500,
};

function toForm(b: BusinessDTO): FormState {
  return {
    name: b.name,
    timezone: b.timezone,
    status: b.status,
    whatsappPhoneNumber: b.whatsappPhoneNumber ?? "",
    whatsappPhoneNumberId: b.whatsappPhoneNumberId ?? "",
    whatsappBusinessId: b.whatsappBusinessId ?? "",
    whatsappAccessToken: "", // never prefilled — leaving blank keeps the stored token
    whatsappVerifyToken: "",
    aiEnabled: b.aiEnabled,
    autoReply: b.autoReply,
    aiModel: b.aiModel ?? "",
    aiSystemPrompt: b.aiSystemPrompt ?? "",
    aiTemperature: b.aiTemperature,
    aiMaxTokens: b.aiMaxTokens,
  };
}

export default function BusinessesPage() {
  const { data, isLoading } = useBusinesses();
  const switchBusiness = useSwitchBusiness();
  const createBusiness = useCreateBusiness();
  const updateBusiness = useUpdateBusiness();
  const deleteBusiness = useDeleteBusiness();

  const [editing, setEditing] = useState<BusinessDTO | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BusinessDTO | null>(null);

  const businesses = data?.data ?? [];
  const currentId = data?.currentBusinessId;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (b: BusinessDTO) => {
    setEditing(b);
    setForm(toForm(b));
    setError(null);
    setShowForm(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Empty secret means "leave unchanged" — don't send it.
    const payload: BusinessInput = { ...form };
    if (!payload.whatsappAccessToken) delete payload.whatsappAccessToken;
    if (!payload.whatsappVerifyToken) delete payload.whatsappVerifyToken;

    try {
      if (editing) {
        await updateBusiness.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createBusiness.mutateAsync(payload);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteBusiness.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const saving = createBusiness.isPending || updateBusiness.isPending;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Businesses"
        description="Each business is an independent WhatsApp account with its own contacts, conversations, campaigns, templates, knowledge base and AI settings."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New business
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {businesses.map((b) => {
            const isCurrent = b.id === currentId;
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{b.name}</p>
                      {isCurrent && (
                        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-400">/{b.slug}</p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge
                        className={
                          b.whatsappPhoneNumberId
                            ? "bg-sky-50 text-sky-700 ring-sky-600/15"
                            : "bg-slate-50 text-slate-400 ring-slate-500/15"
                        }
                      >
                        <MessageSquare className="mr-1 h-3 w-3" />
                        {b.whatsappPhoneNumber || b.whatsappPhoneNumberId || "No number"}
                      </Badge>
                      <Badge
                        className={
                          b.aiEnabled
                            ? "bg-violet-50 text-violet-700 ring-violet-600/15"
                            : "bg-slate-50 text-slate-400 ring-slate-500/15"
                        }
                      >
                        <Sparkles className="mr-1 h-3 w-3" />
                        {b.aiEnabled ? "AI on" : "AI off"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => switchBusiness.mutate(b.id)}
                      disabled={switchBusiness.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Switch
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => setConfirmDelete(b)}
                    disabled={businesses.length <= 1}
                    title={businesses.length <= 1 ? "You can't delete your only business" : "Delete"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit form */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit business" : "New business"}
        description="Connect a WhatsApp number and configure this business's own AI chatbot."
      >
        <form onSubmit={submit} className="space-y-5">
          <Field label="Business name" htmlFor="b-name" required>
            <input
              id="b-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Renzo Sales"
              className={inputClass}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Timezone" htmlFor="b-tz">
              <input
                id="b-tz"
                value={form.timezone ?? ""}
                onChange={(e) => set("timezone", e.target.value)}
                className={inputClass}
              />
            </Field>
            {editing && (
              <Field label="Status" htmlFor="b-status">
                <select
                  id="b-status"
                  value={form.status ?? "ACTIVE"}
                  onChange={(e) => set("status", e.target.value as BusinessDTO["status"])}
                  className={selectClass}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </Field>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Display number" htmlFor="b-wa-num">
                  <input
                    id="b-wa-num"
                    value={form.whatsappPhoneNumber ?? ""}
                    onChange={(e) => set("whatsappPhoneNumber", e.target.value)}
                    placeholder="+91 98765 43210"
                    className={inputClass}
                  />
                </Field>
                <Field label="Phone number ID" htmlFor="b-wa-id">
                  <input
                    id="b-wa-id"
                    value={form.whatsappPhoneNumberId ?? ""}
                    onChange={(e) => set("whatsappPhoneNumberId", e.target.value)}
                    placeholder="Meta phone_number_id"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="WhatsApp Business Account ID" htmlFor="b-waba">
                <input
                  id="b-waba"
                  value={form.whatsappBusinessId ?? ""}
                  onChange={(e) => set("whatsappBusinessId", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Access token" htmlFor="b-token">
                  <input
                    id="b-token"
                    type="password"
                    value={form.whatsappAccessToken ?? ""}
                    onChange={(e) => set("whatsappAccessToken", e.target.value)}
                    placeholder={editing ? "•••••• (unchanged)" : "Meta access token"}
                    className={inputClass}
                  />
                </Field>
                <Field label="Verify token" htmlFor="b-verify">
                  <input
                    id="b-verify"
                    value={form.whatsappVerifyToken ?? ""}
                    onChange={(e) => set("whatsappVerifyToken", e.target.value)}
                    placeholder={editing ? "•••••• (unchanged)" : "Webhook verify token"}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Sparkles className="h-3.5 w-3.5" /> AI chatbot
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Enable AI for this business</span>
                <Toggle checked={!!form.aiEnabled} onChange={(v) => set("aiEnabled", v)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Auto-reply to inbound messages</span>
                <Toggle checked={!!form.autoReply} onChange={(v) => set("autoReply", v)} />
              </div>
              <Field label="Model" htmlFor="b-model">
                <input
                  id="b-model"
                  value={form.aiModel ?? ""}
                  onChange={(e) => set("aiModel", e.target.value)}
                  placeholder="e.g. llama-3.3-70b-versatile"
                  className={inputClass}
                />
              </Field>
              <Field label="System prompt" htmlFor="b-prompt">
                <textarea
                  id="b-prompt"
                  value={form.aiSystemPrompt ?? ""}
                  onChange={(e) => set("aiSystemPrompt", e.target.value)}
                  rows={3}
                  placeholder="How this business's chatbot should behave…"
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Temperature" htmlFor="b-temp">
                  <input
                    id="b-temp"
                    type="number"
                    step="0.1"
                    min={0}
                    max={2}
                    value={form.aiTemperature ?? 0.7}
                    onChange={(e) => set("aiTemperature", Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Max tokens" htmlFor="b-max">
                  <input
                    id="b-max"
                    type="number"
                    min={64}
                    max={8192}
                    value={form.aiMaxTokens ?? 500}
                    onChange={(e) => set("aiMaxTokens", Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || form.name.trim().length < 2}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create business"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete business?"
        description={
          confirmDelete
            ? `This permanently deletes "${confirmDelete.name}" and all of its contacts, conversations, campaigns, templates and knowledge. This cannot be undone.`
            : ""
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onDelete} disabled={deleteBusiness.isPending}>
            {deleteBusiness.isPending ? "Deleting…" : "Delete business"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
