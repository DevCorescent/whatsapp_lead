// TODO [HEMANT]: Contact Detail page.
//
// Layout:
//   - Back button
//   - ContactHeader: Avatar, Name, Phone, Edit button
//   - Left column: Contact info fields (company, email, location, source, tags)
//   - Right column: Tabs (Activity | Conversations | Leads | Notes)
//     Activity tab: Timeline of all touchpoints (messages, calls, emails, stage changes)
//     Conversations tab: List of WhatsApp conversations
//     Leads tab: All leads linked to this contact with stage badges
//     Notes tab: Free-text notes editor
//
// TODO [SHALMON]: GET /api/contacts/:id (full contact with relations)

import Link from "next/link";

interface Props { params: Promise<{ id: string }> }

export default async function ContactDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div>
      <div className="mb-6">
        <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-700">← Back to Contacts</Link>
      </div>
      {/* TODO [HEMANT]: Build full contact detail layout */}
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        Contact detail for ID: {id} — coming soon
      </div>
    </div>
  );
}
