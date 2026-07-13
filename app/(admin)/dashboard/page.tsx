// TODO [HEMANT]: Super-admin overview dashboard.
// Fetch from GET /api/admin/stats
//
// KPI Cards:
//   Total Tenants | Active Tenants | MRR | Total Messages This Month
//   Total Users | Signups This Month | Total Leads | Won Deals
//
// Charts:
//   - Line chart: Signups last 30 days
//   - Pie/bar chart: Plan distribution (Starter/Growth/Enterprise count)

export default function AdminDashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Platform Overview</h1>
      <p className="text-gray-400 mb-8">Real-time stats across all tenants</p>

      {/* TODO [HEMANT]: KPI cards grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {["Total Tenants", "MRR", "Total Users", "Messages (30d)"].map((label) => (
          <div key={label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">—</p>
            <p className="text-xs text-gray-500 mt-1">Fetching...</p>
          </div>
        ))}
      </div>

      {/* TODO [HEMANT]: Charts section */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-64">
          <h3 className="text-white font-medium mb-4">Signups (Last 30 Days)</h3>
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Chart placeholder</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-64">
          <h3 className="text-white font-medium mb-4">Plan Distribution</h3>
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Chart placeholder</div>
        </div>
      </div>
    </div>
  );
}
