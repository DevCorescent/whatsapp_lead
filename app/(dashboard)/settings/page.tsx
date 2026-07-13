// TODO [HEMANT]: Workspace Settings page.
// Tabs:
//   1. General – Workspace name, logo upload, timezone
//   2. WhatsApp – Phone number ID, Business Account ID, API Key, Verify Token (masked)
//   3. SMTP – Custom email settings for notifications
//   4. Billing – Current plan, usage meters, upgrade button, invoice history
//   5. Notifications – Which events trigger email/WhatsApp notifications
//   6. Danger Zone – Delete workspace
// TODO [SHALMON]: PATCH /api/settings (general, whatsapp, smtp tabs)

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Settings page coming soon — TODO [HEMANT + SHALMON]
      </div>
    </div>
  );
}
