// TODO [HEMANT]: Knowledge Base & RAG page.
// Upload panel: Drag-and-drop area for PDF/DOCX, URL input, FAQ text editor
// Documents list: Name | Type | Status (Indexed/Processing/Failed) | Chunks | Uploaded At | Delete
// Status indicator: "AI is trained on X documents, Y chunks"
// "Test AI" panel: Ask a question, see AI answer + source reference
// TODO [GAURANSH]: /api/knowledge CRUD + indexing pipeline

export default function KnowledgeBasePage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ Upload Document</button>
      </div>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Knowledge base module coming soon — TODO [HEMANT + GAURANSH]
      </div>
    </div>
  );
}
