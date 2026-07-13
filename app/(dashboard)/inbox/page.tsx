// TODO [HEMANT]: Build the WhatsApp Shared Inbox UI.
//
// 3-column layout:
//
// ┌───────────────┬─────────────────────────┬───────────────┐
// │ Conversation  │     Chat Window         │ Contact Panel │
// │ List          │                         │               │
// │               │  ┌─────────────────┐   │  Name, Phone  │
// │ [Search]      │  │ msg bubble      │   │  Company      │
// │ [Filter tabs] │  │      msg bubble │   │  Lead score   │
// │               │  └─────────────────┘   │  Tags         │
// │ Conv card     │  [Input + Attach + Send]│  Assign agent │
// │ Conv card     │                         │  Notes tab    │
// └───────────────┴─────────────────────────┴───────────────┘
//
// Left panel (ConversationList):
//   - Search bar
//   - Filter tabs: All | Open | Assigned | Resolved
//   - Sort by: Latest / Unread
//   - Each card: Contact avatar, name, last message preview, time, unread badge, label chips
//   - AI Active indicator (green dot)
//
// Center panel (ChatWindow):
//   - Message bubbles: inbound (left, gray), outbound (right, green)
//   - Message types: text, image, video, document, audio player
//   - Internal notes styled differently (yellow background, "Note" badge)
//   - AI-generated badge on AI messages
//   - Date separator between messages
//   - Message status icons (sent/delivered/read tick)
//   - Bottom toolbar: Attach, Quick Reply (/shortcode), Emoji, AI Suggest, Send
//   - Toggle: "AI Auto-Reply" switch at top
//
// Right panel (ContactPanel):
//   - Contact info (avatar, name, phone, company)
//   - Lead score badge
//   - Tags with color chips
//   - Assign Agent dropdown
//   - Add to Lead button
//   - Create Ticket button
//   - Tabs: Notes | Activities | Tickets
//
// TODO [GAURANSH]: Wire up:
//   - GET /api/conversations (list)
//   - GET /api/conversations/:id/messages (messages)
//   - POST /api/messages (send)
//   - Pusher channel for real-time new messages

import { auth } from "@/lib/auth";

export default async function InboxPage() {
  const session = await auth();

  return (
    <div className="h-full -m-6">
      {/* TODO [HEMANT]: Replace with full 3-column inbox layout */}
      <div className="flex h-full">
        {/* Left panel */}
        <div className="w-80 border-r bg-white flex flex-col">
          <div className="p-4 border-b">
            <input placeholder="Search conversations..." className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex-1 overflow-auto p-2">
            <p className="text-center text-gray-400 text-sm mt-10">No conversations yet</p>
          </div>
        </div>

        {/* Center panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a conversation to start
          </div>
          <div className="border-t p-4 bg-white">
            <div className="flex gap-2">
              <input placeholder="Type a message..." className="flex-1 border rounded-lg px-4 py-2 text-sm" />
              <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Send</button>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-72 border-l bg-white p-4">
          <p className="text-sm text-gray-400">Select a conversation to see contact details</p>
        </div>
      </div>
    </div>
  );
}
