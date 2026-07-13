// TODO [HEMANT]: Tenant management table (SUPER_ADMIN).
// Fetch from GET /api/admin/tenants
//
// Table columns: Name, Slug, Plan, Users, Messages/mo, Status (active/suspended), Joined, Actions
// Actions: View details, Suspend/Activate, Change Plan
// Search + filter by plan/status
// Click row → /admin/tenants/[id]

export default function AdminTenantsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="text-gray-400 text-sm mt-1">Manage all workspace accounts</p>
        </div>
        {/* TODO [HEMANT]: Add Provision Tenant button → modal form */}
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm">
          + Provision Tenant
        </button>
      </div>

      {/* TODO [HEMANT]: Search + filter bar */}
      <div className="flex gap-3 mb-4">
        <input
          placeholder="Search by name or slug..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500"
        />
        <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
          <option>All Plans</option>
          <option>Starter</option>
          <option>Growth</option>
          <option>Enterprise</option>
        </select>
        <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
          <option>All Status</option>
          <option>Active</option>
          <option>Suspended</option>
        </select>
      </div>

      {/* TODO [HEMANT]: Data table component with tenants */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900">
              <th className="text-left text-gray-400 px-4 py-3 font-medium">Workspace</th>
              <th className="text-left text-gray-400 px-4 py-3 font-medium">Plan</th>
              <th className="text-left text-gray-400 px-4 py-3 font-medium">Users</th>
              <th className="text-left text-gray-400 px-4 py-3 font-medium">Msgs/mo</th>
              <th className="text-left text-gray-400 px-4 py-3 font-medium">Status</th>
              <th className="text-left text-gray-400 px-4 py-3 font-medium">Joined</th>
              <th className="text-left text-gray-400 px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-700 hover:bg-gray-750 text-gray-300">
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                No tenants found — implement GET /api/admin/tenants
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
