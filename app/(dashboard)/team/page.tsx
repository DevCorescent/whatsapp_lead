// TODO [HEMANT]: Team Management page.
// Table: Avatar | Name | Email | Role | Status | Last Login | Actions (Edit Role, Deactivate)
// "Invite Member" button → modal with email input + role selector
// Role selector: ADMIN, MANAGER, AGENT, MARKETING_USER
// TODO [SHALMON]: /api/team (list, invite, update role, deactivate)

export default function TeamPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ Invite Member</button>
      </div>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Team management coming soon — TODO [HEMANT + SHALMON]
      </div>
    </div>
  );
}
