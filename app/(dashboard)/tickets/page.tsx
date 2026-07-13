// TODO [HEMANT]: Ticketing System page.
// Table: Subject | Contact | Status | Priority | Department | Assigned | SLA | Created | Actions
// Filter by: Status, Priority, Department, Assigned Agent
// Row click → Ticket Detail drawer (conversation thread + internal notes + activity log)
// TODO [GAURANSH]: /api/tickets CRUD

export default function TicketsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ New Ticket</button>
      </div>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Ticketing module coming soon — TODO [HEMANT + GAURANSH]
      </div>
    </div>
  );
}
