// TODO [HEMANT]: AI Settings page.
// Sections:
//   1. AI Toggle (enable/disable AI auto-reply)
//   2. AI Model selector (gpt-4o-mini / gpt-4o)
//   3. AI Persona / System Prompt textarea
//   4. Auto-reply delay (seconds slider)
//   5. Business Hours toggle (only reply during business hours)
//   6. Off-hours message textarea
//   7. Escalation settings (escalate to human after N unanswered messages)
// TODO [SHALMON]: PATCH /api/settings/ai (update TenantSettings AI fields)

export default function AISettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">AI Settings</h1>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        AI settings form coming soon — TODO [HEMANT + SHALMON]
      </div>
    </div>
  );
}
