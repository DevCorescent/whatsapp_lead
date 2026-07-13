// TODO [HEMANT]: Revenue analytics page (SUPER_ADMIN).
//
// Metrics:
//   - MRR (monthly recurring revenue)
//   - ARR (annualized)
//   - Churn rate (subscriptions cancelled this month / active last month)
//   - New MRR vs Churned MRR
//   - Revenue by plan (bar chart)
//   - Revenue trend (last 12 months line chart)

export default function AdminRevenuePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Revenue</h1>
      <p className="text-gray-400 mb-8">Subscription and billing analytics</p>

      {/* TODO [HEMANT]: Revenue KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {["MRR", "ARR", "Churn Rate", "New MRR"].map((label) => (
          <div key={label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">—</p>
          </div>
        ))}
      </div>

      {/* TODO [HEMANT]: Revenue charts */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-72 col-span-2">
          <h3 className="text-white font-medium mb-4">Revenue Trend (Last 12 Months)</h3>
          <div className="h-52 flex items-center justify-center text-gray-500 text-sm">
            Line chart placeholder — use Recharts LineChart
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-64">
          <h3 className="text-white font-medium mb-4">Revenue by Plan</h3>
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Bar chart placeholder</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-64">
          <h3 className="text-white font-medium mb-4">Recent Subscriptions</h3>
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Table placeholder</div>
        </div>
      </div>
    </div>
  );
}
