"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserCog,
  UserPlus,
  Users,
  Radio,
  Headphones,
  ShieldCheck,
  ShieldOff,
  MessagesSquare,
} from "lucide-react";
import type { User, UserRole } from "@prisma/client";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SkeletonRows,
  inputClass,
} from "@/components/ui";
import { cn, formatCompact, timeAgo } from "@/lib/utils";

// TODO [SHALMON]: GET /api/team + POST /api/team/invite (currently 501).

type Member = User & { _count?: { assignedConvs?: number; assignedTickets?: number } };

const ROLE_STYLE: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-slate-900 text-white ring-slate-900/20",
  TENANT_OWNER: "bg-violet-50 text-violet-700 ring-violet-600/20",
  ADMIN: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  MANAGER: "bg-sky-50 text-sky-700 ring-sky-600/20",
  AGENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  MARKETING_USER: "bg-amber-50 text-amber-800 ring-amber-600/20",
};

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  TENANT_OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  AGENT: "Agent",
  MARKETING_USER: "Marketing",
};

/** Roles a workspace owner can hand out. SUPER_ADMIN and TENANT_OWNER aren't invitable. */
const INVITABLE_ROLES: UserRole[] = ["ADMIN", "MANAGER", "AGENT", "MARKETING_USER"];

function useTeam() {
  return useQuery<Member[]>({
    queryKey: ["team"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error(`Failed to load team (${res.status})`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
  });
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useTeam();
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const toggleActive = async (member: Member) => {
    const label = member.isActive ? "deactivate" : "activate";
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${member.name}?`)) return;
    await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !member.isActive }),
    });
    queryClient.invalidateQueries({ queryKey: ["team"] });
  };

  const members = data ?? [];
  const stats = {
    total: members.length,
    active: members.filter((m) => m.isActive).length,
    agents: members.filter((m) => m.role === "AGENT").length,
    admins: members.filter((m) => m.role === "ADMIN" || m.role === "TENANT_OWNER").length,
  };

  return (
    <div>
      <PageHeader
        title="Team"
        description="Invite teammates and control what each of them can do."
        action={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} label="Total members" value={stats.total} tone="bg-slate-100 text-slate-600" />
        <StatTile icon={Radio} label="Active now" value={stats.active} tone="bg-emerald-50 text-emerald-600" />
        <StatTile icon={Headphones} label="Agents" value={stats.agents} tone="bg-sky-50 text-sky-600" />
        <StatTile icon={ShieldCheck} label="Admins" value={stats.admins} tone="bg-violet-50 text-violet-600" />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={5} />
          </div>
        ) : isError || members.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title={isError ? "Your team isn't available yet" : "No team members yet"}
            description={
              isError
                ? "The team API is still being built. Once it's live, everyone in your workspace will be listed here with their role and activity."
                : "Invite an agent to start sharing the inbox and handling conversations together."
            }
            action={
              <Button onClick={() => setOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Invite Member
              </Button>
            }
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium">Conversations</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.name} src={m.avatar} size="sm" />
                        <span className="font-medium text-slate-900">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{m.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={ROLE_STYLE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            m.isActive ? "bg-emerald-500" : "bg-slate-300",
                          )}
                        />
                        {m.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {m.lastLoginAt ? timeAgo(m.lastLoginAt) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 tabular-nums text-slate-700">
                        <MessagesSquare className="h-3.5 w-3.5 text-slate-400" />
                        {formatCompact((m as any)._count?.assignedConvs ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingMember(m)}>
                          <UserCog className="h-4 w-4" />
                          Change role
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={m.isActive ? "text-rose-600 hover:bg-rose-50" : ""}
                          onClick={() => toggleActive(m)}
                        >
                          {m.isActive ? (
                            <>
                              <ShieldOff className="h-4 w-4" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4" />
                              Activate
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InviteModal open={open} onClose={() => setOpen(false)} />
      <ChangeRoleModal member={editingMember} onClose={() => setEditingMember(null)} />
    </div>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("AGENT");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async (data: { name: string; email: string; role: UserRole }) => {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to invite member");
      return json;
    },
    onSuccess: (json) => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      const pwd = json.data?.tempPassword;
      setSuccess(pwd ? `Invited! Temporary password: ${pwd}` : "Member invited successfully.");
      setName(""); setEmail(""); setRole("AGENT");
    },
    onError: (err: Error) => setError(err.message),
  });

  const close = () => { setName(""); setEmail(""); setError(null); setSuccess(null); onClose(); };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite Member"
      description="Add a teammate to this workspace. They can log in with the temporary password."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          invite.mutate({ name, email, role });
        }}
      >
        <Field label="Full name" htmlFor="invite-name" required>
          <input
            id="invite-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Jane Smith"
          />
        </Field>

        <Field label="Email address" htmlFor="invite-email" required>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="teammate@company.com"
          />
        </Field>

        <Field label="Role" htmlFor="invite-role" required>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className={inputClass}
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            {role === "ADMIN" && "Full access to every workspace setting except billing."}
            {role === "MANAGER" && "Can see all conversations, leads and reports for the team."}
            {role === "AGENT" && "Handles conversations assigned to them and their own leads."}
            {role === "MARKETING_USER" && "Access to campaigns, templates and analytics only."}
          </p>
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || !email.trim() || invite.isPending}>
            <UserPlus className="h-4 w-4" />
            {invite.isPending ? "Inviting…" : "Invite Member"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeRoleModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<UserRole>(member?.role ?? "AGENT");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (member) setRole(member.role); }, [member]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/team/${member!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["team"] }); onClose(); },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open={!!member} onClose={onClose} title="Change Role" description={`Update ${member?.name ?? ""}'s role.`}>
      <div className="space-y-4">
        <Field label="Role" htmlFor="change-role">
          <select id="change-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
            {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}
