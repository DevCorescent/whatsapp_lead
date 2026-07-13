// TODO [HEMANT]: Build the Contacts / CRM page.
//
// Layout:
//   - PageHeader: "Contacts" title + "Add Contact" button + "Import CSV" button
//   - StatsRow: Total contacts, New this month, Blocked
//   - Filters: Search bar, Filter by Tag, Filter by Source, Filter by Date
//   - ContactsTable:
//       Columns: Checkbox | Avatar+Name | Phone | Email | Company | Source | Tags | Last Active | Actions
//       Row actions: View, Edit, Delete, Block, Add to Campaign
//   - Pagination (10/25/50 per page)
//
// TODO [SHALMON]: Wire up:
//   - GET /api/contacts?page=&limit=&search=&tag=&source= (list with pagination)
//   - POST /api/contacts (create)
//   - PATCH /api/contacts/:id (update)
//   - DELETE /api/contacts/:id (soft delete / block)
//   - POST /api/contacts/import (CSV import)

export default function ContactsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <div className="flex gap-3">
          <button className="border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Import CSV</button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ Add Contact</button>
        </div>
      </div>

      {/* TODO [HEMANT]: Replace with full DataTable */}
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Contacts table coming soon
      </div>
    </div>
  );
}
