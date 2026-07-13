// TODO [HEMANT]: Plan management page (SUPER_ADMIN).
// Fetch from GET /api/admin/plans
//
// Show plan cards: name, price, limits, subscriber count
// Edit plan limits/pricing inline (modal or drawer)
// Toggle plan visibility (isActive)

export default function AdminPlansPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Plans</h1>
          <p className="text-gray-400 text-sm mt-1">Manage subscription plans and pricing</p>
        </div>
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm">
          + New Plan
        </button>
      </div>

      {/* TODO [HEMANT]: Plan cards grid — fetch from /api/admin/plans */}
      <div className="grid grid-cols-3 gap-6">
        {["Starter", "Growth", "Enterprise"].map((plan) => (
          <div key={plan} className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">{plan}</h3>
              <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full">Active</span>
            </div>
            <p className="text-2xl font-bold text-white mb-4">—<span className="text-sm text-gray-400 font-normal">/mo</span></p>
            <div className="space-y-1 text-sm text-gray-400 mb-4">
              <div>— contacts</div>
              <div>— messages/mo</div>
              <div>— agents</div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded text-sm">Edit</button>
              <button className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded text-sm">— tenants</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
