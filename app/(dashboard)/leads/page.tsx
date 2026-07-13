// TODO [HEMANT]: Build the Lead Pipeline / Kanban board page.
//
// Layout:
//   - PageHeader: "Leads" title + "Add Lead" button + View toggle (Kanban / List)
//   - Filter bar: Search, Assigned To, Date Range, Score (Cold/Warm/Hot/SQL)
//   - KanbanBoard:
//       7 columns: NEW_LEAD | CONTACTED | QUALIFIED | PROPOSAL_SENT | NEGOTIATION | WON | LOST
//       Each column: stage title, lead count, total value sum
//       Lead cards:
//         - Contact name + avatar
//         - Lead title
//         - Score badge (colored: COLD=blue, WARM=yellow, HOT=orange, QUALIFIED=green)
//         - Deal value (₹ formatted)
//         - Assigned agent avatar
//         - Due date indicator
//       Drag-and-drop between columns (use @hello-pangea/dnd or react-beautiful-dnd)
//       Click on card → LeadDrawer (side panel with full details)
//
// TODO [GAURANSH]: Wire up:
//   - GET /api/leads?stage=&assignedTo=&search= (grouped by stage)
//   - POST /api/leads (create lead)
//   - PATCH /api/leads/:id (update stage / score)
//   - DELETE /api/leads/:id

const STAGES = [
  { id: "NEW_LEAD", label: "New Lead", color: "bg-blue-100 border-blue-300" },
  { id: "CONTACTED", label: "Contacted", color: "bg-purple-100 border-purple-300" },
  { id: "QUALIFIED", label: "Qualified", color: "bg-yellow-100 border-yellow-300" },
  { id: "PROPOSAL_SENT", label: "Proposal Sent", color: "bg-orange-100 border-orange-300" },
  { id: "NEGOTIATION", label: "Negotiation", color: "bg-pink-100 border-pink-300" },
  { id: "WON", label: "Won", color: "bg-green-100 border-green-300" },
  { id: "LOST", label: "Lost", color: "bg-red-100 border-red-300" },
];

export default function LeadsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lead Pipeline</h1>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ Add Lead</button>
      </div>

      {/* TODO [HEMANT]: Replace with full drag-drop KanbanBoard */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div key={stage.id} className={`shrink-0 w-64 rounded-xl border-2 ${stage.color} p-3`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
              <span className="text-xs bg-white rounded-full px-2 py-0.5 text-gray-500">0</span>
            </div>
            <div className="min-h-20 flex items-center justify-center">
              <p className="text-xs text-gray-400">No leads</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
