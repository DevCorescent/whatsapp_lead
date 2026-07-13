// TODO [HEMANT]: Chatbot Flow Builder page.
//
// Left sidebar: List of flows (name, status badge, trigger type, last updated)
//   - "New Flow" button at top
//   - Each flow card: click to open in canvas
//
// Main canvas (use React Flow or build custom):
//   Node types to support:
//   - Message Block  (send a WhatsApp message)
//   - Condition Block (if/else branching on reply keyword or button click)
//   - Delay Block    (wait N minutes/hours before next step)
//   - AI Block       (call AI to generate dynamic reply)
//   - API Block      (call external webhook)
//   - Form Block     (collect user input and save to contact fields)
//
// Right panel: Node config editor (appears when a node is clicked)
// Top toolbar: Save, Activate/Deactivate, Test Flow button
//
// TODO [GAURANSH]: Wire up /api/chatbot/flows CRUD.

export default function ChatbotPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Chatbot Builder</h1>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ New Flow</button>
      </div>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Flow builder canvas coming soon — TODO [HEMANT + GAURANSH]
      </div>
    </div>
  );
}
