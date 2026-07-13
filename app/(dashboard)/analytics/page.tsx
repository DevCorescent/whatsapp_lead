// TODO [HEMANT]: Build the Analytics Dashboard page.
//
// KPI Cards row (use recharts for charts):
//   - Total Leads | Qualified Leads | Conversion Rate | Active Conversations
//   - Revenue Pipeline | Messages Sent | Campaign ROI | Open Tickets
//
// Charts section:
//   - Messages Over Time (LineChart – 7d / 30d / 90d toggle)
//   - Lead Pipeline Distribution (BarChart by stage)
//   - Campaign Performance (BarChart: Sent/Delivered/Read/Replied per campaign)
//   - Lead Score Distribution (PieChart: Cold/Warm/Hot/SQL)
//   - Agent Performance Table (agent name, conversations, response time, resolved)
//
// Date range filter at top (Today / 7 Days / 30 Days / Custom)
//
// TODO [GAURANSH]: Wire up /api/analytics endpoints for each chart.

export default function AnalyticsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <select className="border rounded-lg px-3 py-2 text-sm">
          <option>Last 7 Days</option>
          <option>Last 30 Days</option>
          <option>Last 90 Days</option>
        </select>
      </div>

      {/* TODO [HEMANT]: Replace with full KPI + charts layout */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {["Total Leads", "Qualified Leads", "Conversion Rate", "Active Chats"].map((kpi) => (
          <div key={kpi} className="bg-white rounded-xl border p-5">
            <p className="text-sm text-gray-500 mb-1">{kpi}</p>
            <p className="text-3xl font-bold text-gray-900">—</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5 h-64 flex items-center justify-center text-gray-400">
          Messages Over Time chart (recharts)
        </div>
        <div className="bg-white rounded-xl border p-5 h-64 flex items-center justify-center text-gray-400">
          Lead Pipeline chart (recharts)
        </div>
      </div>
    </div>
  );
}
