// TODO [HEMANT]: Campaign Management page.
//
// Tabs: All Campaigns | Drafts | Scheduled | Running | Completed
// Table columns: Name | Template | Status | Scheduled At | Sent | Delivered | Read | Replied | Actions
// "New Campaign" button → opens campaign wizard (multi-step):
//   Step 1: Name + Template selection
//   Step 2: Audience (All Contacts / Segment by tag/source/score)
//   Step 3: Schedule (Send Now / Schedule Date-Time)
//   Step 4: Review & Launch
//
// TODO [GAURANSH]: Wire up /api/campaigns CRUD + status polling.

export default function CampaignsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ New Campaign</button>
      </div>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Campaigns module coming soon — TODO [HEMANT + GAURANSH]
      </div>
    </div>
  );
}
