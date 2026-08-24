/**
 * Seed content for the marketing blog.
 *
 * A typed module rather than a CMS or a database table: the blog is a public marketing
 * surface, and giving it rows would mean a schema change and a migration for content
 * that today is written by hand. When a CMS arrives, this file is the shape it has to
 * produce — `getPost`/`listPosts` are the only two things the pages call, so swapping
 * the source behind them touches nothing else.
 *
 * EDITORIAL RULE, and it is the reason several of these read more cautiously than a
 * typical SaaS blog: an article may only describe behaviour that exists in this
 * repository today. No adoption figures, no revenue recovered, no reply-rate uplifts,
 * no named customers — the project has none it can verify, and a blog is exactly where
 * that kind of claim gets quoted back at you. Where a number would normally go, these
 * articles explain a mechanism instead.
 */

/** The motif each thumbnail draws. Shared vocabulary, so covers read as one set. */
export type PostMotif = "chat" | "score" | "flow" | "pipeline" | "chart" | "doc";

export type PostCategory =
  | "Guides"
  | "WhatsApp Marketing"
  | "AI"
  | "Automation"
  | "CRM"
  | "Sales"
  | "Product";

export interface PostSection {
  heading: string;
  /** Rendered as paragraphs, in order. */
  body: string[];
  /** Optional bullet list rendered after the paragraphs. */
  list?: string[];
}

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  category: PostCategory;
  author: string;
  role: string;
  date: string;
  /** ISO form, for <time dateTime> and for sorting without parsing prose. */
  isoDate: string;
  readTime: string;
  motif: PostMotif;
  /** Standfirst under the title on the article page. */
  intro: string;
  sections: PostSection[];
}

/** Filter chips on the listing page. "All" is prepended by the UI, not stored here. */
export const CATEGORIES: PostCategory[] = [
  "Guides",
  "WhatsApp Marketing",
  "AI",
  "Automation",
  "CRM",
  "Sales",
  "Product",
];

export const POSTS: Post[] = [
  {
    slug: "whatsapp-cloud-api-setup-2026",
    title: "How to set up the WhatsApp Cloud API in 2026",
    excerpt:
      "Meta Business verification, number registration and your first delivered message — a walkthrough you can finish in an afternoon.",
    category: "Guides",
    author: "Kavya Menon",
    role: "Solutions Engineer",
    date: "17 June 2026",
    isoDate: "2026-06-17",
    readTime: "11 min read",
    motif: "doc",
    intro:
      "Getting started with the WhatsApp Cloud API looks intimidating from the outside: business verification, a phone number you cannot un-register, and template approval sitting between you and your first send. In practice it is four steps, and none of them need a developer.",
    sections: [
      {
        heading: "Before you start, get these three things ready",
        body: [
          "Almost every setup that stalls, stalls on paperwork rather than on code. Have these in hand before you open Meta Business Manager and the rest of the process is mechanical.",
        ],
        list: [
          "A registered business name and address that match your incorporation documents exactly.",
          "A phone number that is not currently active on the WhatsApp consumer app or WhatsApp Business app. Migrating an in-use number is possible, but it has to be deleted from the app first.",
          "Access to that number for a one-time verification code, by SMS or voice call.",
        ],
      },
      {
        heading: "Step 1 — Create and verify your Meta Business Account",
        body: [
          "Business verification is Meta reviewing that your company is real. You upload an incorporation certificate, a utility bill or a bank statement showing the business name and address, and wait. Review usually takes a few working days.",
          "The single most common rejection is a mismatch between the name on your document and the name typed into the form. An abbreviation, a missing 'Pvt Ltd', a different address line — any of these sends you back to the start of the queue. Copy the document exactly.",
        ],
      },
      {
        heading: "Step 2 — Add a WhatsApp Business Account and register your number",
        body: [
          "Inside your verified Business Account, add the WhatsApp product and register your phone number. Meta issues a phone number ID and an access token. Those two values, plus a webhook verify token you choose yourself, are everything a platform needs to send and receive on your behalf.",
          "Treat the access token like a password. In WhatsCRM it is encrypted before it is stored and is never returned to the browser — not in an API response and not in the settings form you typed it into. Any platform that shows it back to you in plain text is storing it in plain text.",
        ],
      },
      {
        heading: "Step 3 — Point the webhook at your platform",
        body: [
          "Meta delivers inbound messages and delivery receipts by calling a URL you nominate. Two things matter here. The first is that the endpoint answers Meta's verification challenge with the token you configured. The second is that it answers fast — Meta gives a webhook a few seconds and treats anything slower as a failed delivery, which it then retries.",
          "That retry behaviour is why serious implementations acknowledge the delivery immediately and do the real work behind it. If a platform runs an AI model call inline on the webhook request, a slow model turns into a duplicate reply in front of your customer.",
          "WhatsCRM also verifies the X-Hub-Signature-256 header on every inbound call, so a request that did not come from Meta is refused rather than processed.",
        ],
      },
      {
        heading: "Step 4 — Submit your first template",
        body: [
          "You cannot message a customer out of the blue with free text. Business-initiated conversations start from a template that Meta has reviewed. Utility templates — order confirmations, delivery updates, OTPs — are usually approved quickly. Marketing templates take longer and are held to a higher bar.",
          "Write the template in clear language, put every variable in context rather than stranding a bare {{1}} at the start of a line, and give a genuine opt-out route. Templates that read like they were built to dodge the review are the ones that get rejected.",
          "Once a template is approved, you can broadcast to contacts who opted in. From there, every reply lands in the inbox as an ordinary conversation, and the 24-hour service window opens for free-text replies.",
        ],
      },
      {
        heading: "What to check once you are live",
        body: [
          "Send yourself a message from a second phone and confirm three things: the contact was created automatically, the message appears in the inbox, and the delivery ticks progress from sent to delivered to read. If all three work, the wiring is correct and everything after this is configuration rather than plumbing.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-lead-qualification-conversation-to-conversion",
    title: "WhatsApp lead qualification: from conversation to conversion",
    excerpt:
      "Most WhatsApp enquiries are never qualified because nobody has time to read them. Here is how to make the reading automatic.",
    category: "Sales",
    author: "Aditya Raghav",
    role: "Head of Sales",
    date: "10 June 2026",
    isoDate: "2026-06-10",
    readTime: "8 min read",
    motif: "pipeline",
    intro:
      "A WhatsApp enquiry arrives with everything you need to qualify it already in the thread. The problem is never a lack of information — it is that reading two hundred threads a week is nobody's job, so nobody does it.",
    sections: [
      {
        heading: "The qualification gap",
        body: [
          "Ask a sales team which of last week's WhatsApp enquiries were serious and you will usually get an answer based on whoever shouted loudest. The customer who said 'I can approve the budget today' and the one who said 'just browsing' look identical in a list of unread chats.",
          "This is a reading problem before it is a CRM problem. The signal is in the conversation; it just never gets extracted.",
        ],
      },
      {
        heading: "BANT still works, because it is four questions",
        body: [
          "Budget, Authority, Need, Timeline. The framework survives because it is short enough to hold in your head and specific enough to argue with. A lead that has all four is genuinely different from one that has need alone.",
          "What has changed is who does the extracting. Reading a forty-message thread and deciding whether authority was established is exactly the kind of judgement a language model handles well, and exactly the kind of work a salesperson skips when they have thirty threads open.",
        ],
      },
      {
        heading: "Score, then sort",
        body: [
          "In WhatsCRM, qualification runs across the whole transcript and returns a verdict on each of the four criteria plus a short reason. Those produce a score from 0 to 100, which sorts the lead into COLD, WARM, HOT or QUALIFIED.",
          "The score is written onto the lead record rather than displayed once and forgotten. That matters more than it sounds: a number that lives on the record can sort a pipeline, filter a view and drive a follow-up. A number in a chat window can only be looked at.",
        ],
      },
      {
        heading: "Keep the reason attached to the number",
        body: [
          "A score with no reasoning is something your team has to take on faith, and the first one they disagree with kills the feature. Every criterion should carry the sentence from the conversation that satisfied it.",
          "When a rep can see that 'Authority' was marked true because the customer wrote 'I handle purchasing for both our outlets', they either agree or they correct it. Both outcomes are better than silent distrust.",
        ],
      },
      {
        heading: "Then let the pipeline do its job",
        body: [
          "Once leads carry a score, the pipeline stops being a list and starts being an order of operations. Qualified leads move to the front, cold ones go to a nurture sequence, and the reps spend their day on conversations that can actually close.",
          "Pipeline stages in WhatsCRM are yours to define — rename, recolour, reorder or add as many as your process needs. The qualification step feeds the pipeline; it does not dictate its shape.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-template-approval",
    title: "Message templates: getting approved by Meta the first time",
    excerpt:
      "Why templates get rejected, what reviewers are actually checking, and how to write one that clears review on the first submission.",
    category: "Guides",
    author: "Kavya Menon",
    role: "Solutions Engineer",
    date: "2 June 2026",
    isoDate: "2026-06-02",
    readTime: "6 min read",
    motif: "chat",
    intro:
      "A rejected template costs you a day and tells you almost nothing about why. The rejection reasons are terse by design, so it pays to understand what a reviewer is looking for before you submit.",
    sections: [
      {
        heading: "Pick the right category, honestly",
        body: [
          "Templates are reviewed against the category you chose. A promotional message submitted as a utility template is the single fastest way to get rejected, and repeat attempts affect how the rest of your submissions are treated.",
          "Utility covers things that follow from an action the customer took — an order confirmation, a delivery update, an appointment reminder. Marketing covers everything intended to create demand. If you are arguing with yourself about which one applies, it is marketing.",
        ],
      },
      {
        heading: "Give every variable context",
        body: [
          "The most common structural rejection is a variable with nothing around it. A template that opens with a bare {{1}} could be filled with anything, and a reviewer has to assume it will be.",
          "Wrap variables in fixed language that constrains them: \"Hi {{1}}, your order {{2}} is out for delivery\" reads as a specific message with two blanks. Avoid putting a variable at the very start or very end of the body, and never put two adjacent variables with no text between them.",
        ],
      },
      {
        heading: "Write it as a message, not as a campaign",
        body: [
          "All-caps urgency, rows of emoji and offers that do not match your registered business are read exactly as they look. So is a template that tries to move the conversation somewhere Meta cannot see.",
          "Say what the message is for, in the language your customers actually use, and stop.",
        ],
      },
      {
        heading: "Track the status rather than resubmitting blind",
        body: [
          "Approval is not instant and it is not always final — a template can be approved and later disabled if it draws enough negative feedback. That means the status you saw on submission day is not necessarily the status today.",
          "WhatsCRM keeps local templates in step with Meta's review state, so an approved template that is later disabled shows as disabled rather than failing silently the next time a campaign tries to use it.",
        ],
      },
      {
        heading: "Keep a spare",
        body: [
          "If one template carries your entire notification flow, its rejection is an outage. Maintain an approved alternative for anything business-critical, and you turn a rejection into an inconvenience.",
        ],
      },
    ],
  },
  {
    slug: "how-ai-lead-scoring-works",
    title: "How AI lead scoring works for WhatsApp conversations",
    excerpt:
      "A plain-English look at how a model reads a chat, judges it against four criteria, and produces a score you can argue with.",
    category: "AI",
    author: "Rishi Bansal",
    role: "AI Engineer",
    date: "1 June 2026",
    isoDate: "2026-06-01",
    readTime: "9 min read",
    motif: "score",
    intro:
      "\"AI lead scoring\" is doing a lot of work as a phrase. Here is the mechanism underneath it, without the marketing: what goes into the model, what comes back, and what the number actually means.",
    sections: [
      {
        heading: "What the model is given",
        body: [
          "The input is the conversation transcript, with speaker labels — Customer and Agent — rather than chat roles. Labels matter: a model asked to judge 'the customer's budget' needs to know which lines are the customer's.",
          "It is the whole thread, not the last message. Authority is often established in message four and never mentioned again; a scoring pass that only reads recent messages misses most of what it is looking for.",
        ],
      },
      {
        heading: "What comes back",
        body: [
          "Four booleans and a sentence. Budget, Authority, Need and Timeline, each true or false, plus a one-line explanation of the judgement. Nothing more elaborate, because a longer output is a longer thing to be wrong about.",
          "Asking for a bare number instead would be worse. A model asked to 'score this lead out of 100' will produce a confident 73 with no way for anyone to check it. Four discrete judgements can each be inspected and disagreed with.",
        ],
      },
      {
        heading: "Where the number comes from",
        body: [
          "The score is arithmetic, not a second model call. Each satisfied criterion is worth 25 points, so the possible scores are 0, 25, 50, 75 and 100 — and the label follows from the score: COLD up to 30, WARM to 60, HOT to 80, QUALIFIED above that.",
          "This is deliberately boring. The judgement is the hard part and belongs to the model; turning four booleans into a number is not, and making that step deterministic means the same conversation always scores the same way.",
        ],
      },
      {
        heading: "What gets written back",
        body: [
          "The score and its label land on the lead. So does the authority judgement, which maps onto a decision-maker flag the sales team already reads.",
          "The other three are returned to whoever asked but not forced into fields that were not built for them. Budget and timeline on a lead record are free-text columns meant for '₹5,00,000' and 'end of Q3'; writing 'true' into them would corrupt data a human relies on. Where a system does not have somewhere honest to put a value, the right move is to not put it anywhere.",
        ],
      },
      {
        heading: "What it is not",
        body: [
          "It is not a prediction of whether the deal will close, and it should not be sold as one. It is a structured reading of what the customer already said. A lead can score 100 and still go quiet, and no scoring model will tell you otherwise.",
          "Treated as a way to order today's follow-ups, it earns its place. Treated as a forecast, it will disappoint you.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-automation-workflows-for-sales-teams",
    title: "WhatsApp automation workflows every sales team should use",
    excerpt:
      "Five flows worth building first — and the one rule that decides where automation should stop and a human should start.",
    category: "Automation",
    author: "Kavya Menon",
    role: "Solutions Engineer",
    date: "26 May 2026",
    isoDate: "2026-05-26",
    readTime: "7 min read",
    motif: "flow",
    intro:
      "Automation on WhatsApp goes wrong in a predictable way: teams automate the conversation instead of the admin around it. These five flows do the second thing.",
    sections: [
      {
        heading: "1. The qualifying menu",
        body: [
          "A tappable menu as the first reply — what are you looking for, which city, what size order — collects in three taps what a rep would otherwise spend four messages establishing. The answers are captured as variables and travel with the conversation.",
          "Build menus that tolerate real people. A customer will tap, but they will also type '2', or 'two', or 'pricing', or nothing resembling any of it. A menu that only understands taps feels broken to everyone whose client renders the buttons badly.",
        ],
      },
      {
        heading: "2. Out-of-hours acknowledgement",
        body: [
          "The worst outcome for a 10pm enquiry is silence until 10am. A flow that acknowledges the message, sets expectations for a reply and offers the FAQ menu in the meantime costs nothing and holds the lead.",
        ],
      },
      {
        heading: "3. Routing by intent",
        body: [
          "Support questions and sales enquiries need different people. A condition node reading the menu choice can assign the thread to the right queue before anyone has opened it, which is the difference between a five-minute response and a five-hour one.",
        ],
      },
      {
        heading: "4. Handoff that actually hands off",
        body: [
          "This is the one most implementations get wrong. A handoff node that only switches the bot off leaves the thread unassigned, and unassigned threads are how leads go missing.",
          "A real handoff picks a specific person. In WhatsCRM the thread goes to the least-loaded active agent, is marked as assigned, and has AI switched off so nothing talks over the human who just took it.",
        ],
      },
      {
        heading: "5. The follow-up nobody remembers",
        body: [
          "A scheduled message two days after a quote is the least glamorous automation on this list and usually the highest returning. It requires no intelligence at all — just something that does not forget.",
        ],
      },
      {
        heading: "The rule about where to stop",
        body: [
          "Automate anything the customer would not notice a human doing differently. Acknowledgement, routing, capturing structured answers, scheduling a nudge — nobody minds.",
          "Stop at the point where the answer requires judgement about their specific situation. That is the moment a customer can tell, and it is the moment automation starts costing you the deal it was supposed to protect.",
        ],
      },
    ],
  },
  {
    slug: "broadcast-campaigns-that-dont-get-blocked",
    title: "Broadcast campaigns that don't get blocked",
    excerpt:
      "Template rejections and quality-rating drops are not bad luck. They follow rules — and the rules are learnable.",
    category: "WhatsApp Marketing",
    author: "Neha Kulkarni",
    role: "Growth Marketer",
    date: "19 May 2026",
    isoDate: "2026-05-19",
    readTime: "6 min read",
    motif: "chart",
    intro:
      "A blocked number is the most expensive mistake in WhatsApp marketing, because it takes your support channel down with your campaigns. Almost every case traces back to one of four decisions.",
    sections: [
      {
        heading: "Opt-in is the whole game",
        body: [
          "WhatsApp is not email, and a purchased list is not an audience. Every recipient should have given you their number for this purpose, and you should be able to say when and where.",
          "Handle opt-out as seriously as opt-in. WhatsCRM treats STOP, UNSUBSCRIBE, CANCEL, END and QUIT as an immediate unsubscribe with a confirmation, and skips those contacts on every AI reply, flow and campaign until they send START. That behaviour runs before anything else on the inbound path, so nothing can talk over it.",
        ],
      },
      {
        heading: "Write the template for a reviewer, not for a funnel",
        body: [
          "Templates are read by a human at Meta before they are read by a customer. Vague variables, all-caps urgency and offers that do not match your business are the reliable rejections.",
          "Put every variable in context. '{{1}}, your order {{2}} has shipped' reads as a real message. A template that opens with a bare {{1}} reads as something built to be filled with anything.",
        ],
      },
      {
        heading: "Segment, or the quality rating will do it for you",
        body: [
          "Blasting an entire contact list is what drives blocks and reports, and enough of those move your number's quality rating down. A lower rating means a lower messaging limit, which means the next campaign reaches fewer people than this one did.",
          "Send to the segment the message is actually for. Fewer, more relevant sends protect the channel that everything else depends on.",
        ],
      },
      {
        heading: "Measure replies, not sends",
        body: [
          "'Sent' is the least interesting number in a campaign report. It tells you the message left the building.",
          "The funnel worth watching is sent, delivered, read and replied. WhatsCRM stamps the message id Meta returns onto each recipient, so delivery receipts correlate back to the exact person and a reply is credited once and only once. If a campaign is read widely and replied to rarely, the offer is the problem — not the deliverability.",
        ],
      },
    ],
  },
  {
    slug: "shared-inbox-vs-whatsapp-groups",
    title: "Shared WhatsApp inbox vs. WhatsApp groups for sales teams",
    excerpt:
      "Group chats have no owner, no history and no accountability. Here is exactly what changes when you move.",
    category: "CRM",
    author: "Aditya Raghav",
    role: "Head of Sales",
    date: "12 May 2026",
    isoDate: "2026-05-12",
    readTime: "5 min read",
    motif: "chat",
    intro:
      "Running sales out of a WhatsApp group works until roughly the fourth person joins. After that, every problem the group has is structural rather than a discipline issue.",
    sections: [
      {
        heading: "Three things a group cannot do",
        body: [
          "The failures are not about your team being careless. They are about what a group chat is.",
        ],
        list: [
          "Ownership. Nobody is assigned, so either three people answer or nobody does. Both are visible to the customer.",
          "History. A rep who joins in March cannot read what was promised in January. The context left with whoever had it on their phone.",
          "Accountability. There is no status, so 'did we get back to them' is answered by scrolling and hoping.",
        ],
      },
      {
        heading: "What a shared inbox changes",
        body: [
          "Every conversation gets an owner and a status — open, assigned, resolved, closed. Filtering to what is yours takes one click, and an unassigned thread is visible as a gap rather than an assumption.",
          "The full history sits with the contact, not with a person's handset. Whoever picks the thread up next reads what was said, including the internal notes your team left for each other — notes that live in the app and are never sent to WhatsApp.",
        ],
      },
      {
        heading: "The part that surprises people",
        body: [
          "The customer experience barely changes, and that is the point. They are still messaging the same number in the same app. What changes is entirely on your side: who is responsible, what has been promised, and whether anyone can tell.",
        ],
      },
      {
        heading: "One number, or several",
        body: [
          "Teams often assume moving off groups means consolidating onto a single number. It does not have to. A workspace can run several WhatsApp numbers, each with its own inbox, contacts, templates and AI configuration — useful if you run two brands, or want sales and support genuinely separated rather than separated by a tag.",
        ],
      },
    ],
  },
  {
    slug: "recover-abandoned-whatsapp-leads",
    title: "How to recover abandoned WhatsApp leads",
    excerpt:
      "Most 'lost' leads were never lost — they went quiet mid-conversation and nobody followed up. A recovery sequence fixes it.",
    category: "WhatsApp Marketing",
    author: "Neha Kulkarni",
    role: "Growth Marketer",
    date: "5 May 2026",
    isoDate: "2026-05-05",
    readTime: "7 min read",
    motif: "chat",
    intro:
      "Abandonment on WhatsApp rarely looks like a rejection. The customer asks a question, gets an answer, says they will think about it — and the thread simply stops. Nobody marks it lost, so nobody follows up.",
    sections: [
      {
        heading: "First, define what abandoned means",
        body: [
          "Abandonment is not an event anybody observes. The customer does not announce it; they just stop replying. That means it has to be derived rather than recorded — a thread with no activity for a defined period, sitting in a stage that is neither won nor lost.",
          "Pick the window deliberately. Two days is impatient for a considered purchase and far too slow for a same-day one.",
        ],
      },
      {
        heading: "Send one message, not a sequence",
        body: [
          "The instinct is to build a five-step drip. Resist it. A customer who went quiet on WhatsApp will read a single, specific follow-up and will mute a sequence.",
          "Reference the actual conversation. 'Still thinking about the 500-unit order?' works. 'We noticed you were interested in our products' tells them they are on a list.",
        ],
      },
      {
        heading: "Make the reply cheap",
        body: [
          "The follow-up should be answerable in one tap. A short menu — still interested, send me the quote again, not right now — converts far better than an open question, because it costs the customer nothing to respond.",
          "It also tells you something a page view never could. When a customer taps 'send me the quote again', they have chosen that question from a list inside their own conversation. WhatsCRM records those taps with the intent they carried, which turns a follow-up into a signal rather than just a nudge.",
        ],
      },
      {
        heading: "Respect the no",
        body: [
          "'Not right now' is a real answer and should move the lead to a stage that reflects it. Continuing to chase someone who declined is how a number earns blocks and reports — and the channel is worth more than the lead.",
        ],
      },
    ],
  },
  {
    slug: "building-a-whatsapp-sales-pipeline",
    title: "Building a WhatsApp sales pipeline with CRM",
    excerpt:
      "Stages, ownership and one rule about deleting them — how to design a pipeline that survives contact with a real sales team.",
    category: "CRM",
    author: "Aditya Raghav",
    role: "Head of Sales",
    date: "28 April 2026",
    isoDate: "2026-04-28",
    readTime: "6 min read",
    motif: "pipeline",
    intro:
      "Most pipelines fail for the same reason: they describe how the founder wishes deals moved rather than how they actually move. A pipeline that does not match reality gets ignored within a month.",
    sections: [
      {
        heading: "Start from what already happens",
        body: [
          "Before designing anything, read twenty recent conversations that closed and twenty that did not. The stages will be obvious, and they are rarely the textbook seven.",
          "Most WhatsApp-led businesses need four or five: something arrived, we replied, we qualified it, we quoted, it closed. Extra stages feel thorough and produce cards that nobody moves.",
        ],
      },
      {
        heading: "Every stage needs an exit condition",
        body: [
          "A stage that cannot be defined in one sentence — 'a quote has been sent' — is not a stage, it is a mood. Ambiguous stages are why two reps put the same deal in different columns.",
        ],
      },
      {
        heading: "Make the stages yours, and keep them editable",
        body: [
          "Your first pipeline will be wrong, which is fine as long as it is changeable. In WhatsCRM stages are data rather than code: you can rename, recolour, reorder, enable, disable or add them with no cap, and mark which one new leads land in.",
          "Two of them carry meaning beyond presentation — the ones that close a deal as won or lost — because analytics needs to know which outcomes count as revenue.",
        ],
      },
      {
        heading: "The rule about deleting a stage",
        body: [
          "Deleting a stage that still has leads in it should be refused, not silently cascaded. A pipeline reshuffle should never be able to quietly destroy the deals sitting in the column you removed — they have to be reassigned first.",
          "It is a small design decision that becomes very important the first time someone tidies up the pipeline on a Friday afternoon.",
        ],
      },
      {
        heading: "Then measure the shape, not just the total",
        body: [
          "A pipeline report that only shows total leads hides the problem. Leads per stage tells you where deals stall — a pile-up at 'quoted' is a pricing conversation, a pile-up at 'contacted' is a qualification one.",
        ],
      },
    ],
  },
  {
    slug: "when-should-ai-hand-over-to-a-human",
    title: "When should an AI WhatsApp agent hand over to a human?",
    excerpt:
      "AI is genuinely good at the first three messages. Here is how to spot the moment it should step aside — and why it must not linger.",
    category: "AI",
    author: "Rishi Bansal",
    role: "AI Engineer",
    date: "21 April 2026",
    isoDate: "2026-04-21",
    readTime: "5 min read",
    motif: "flow",
    intro:
      "The failure mode of an AI agent on WhatsApp is not saying something wrong. It is staying in the conversation two messages past the point where it should have handed over.",
    sections: [
      {
        heading: "Four signals to hand over on",
        body: [
          "These are worth wiring as explicit conditions rather than hoping the model notices.",
        ],
        list: [
          "The customer asks for a person. Always honour this immediately, first time, with no retention attempt.",
          "The same question has been asked twice. A repeat means the answer did not land, and a third phrasing will not fix it.",
          "The conversation turns to money that is not on the price list — discounts, credit terms, custom scope.",
          "Sentiment turns. Frustration compounds fast on a channel people use with their friends.",
        ],
      },
      {
        heading: "Ground the answers, and know when there is no ground",
        body: [
          "An AI agent should answer from your own material rather than from general knowledge. In WhatsCRM, replies are drafted from documents you upload, and the document each reply drew on is recorded on the message — so a wrong answer points you at the file that caused it.",
          "The corollary matters more: when retrieval finds nothing relevant, the honest move is to hand over rather than to improvise. An agent that says 'let me get someone who can answer that properly' is doing its job.",
        ],
      },
      {
        heading: "Hand over to a person, not to a queue",
        body: [
          "A handoff that clears the AI flag and leaves the thread unassigned has not handed anything over. Someone specific has to own it, the thread has to be marked assigned, and the AI has to stop replying so it cannot talk over the human who just arrived.",
        ],
      },
      {
        heading: "Give the human what the AI already knows",
        body: [
          "The rep picking up should not have to re-read forty messages. The full history, the qualification result and the score should already be attached to the thread.",
          "Done properly, handover is not an escalation. It is a colleague joining a conversation already in progress, with the notes in front of them.",
        ],
      },
    ],
  },
  {
    slug: "inside-the-knowledge-base",
    title: "Inside WhatsCRM: how the knowledge base grounds every AI reply",
    excerpt:
      "Upload, index, retrieve, cite. A look at what happens between dropping in a PDF and a customer getting an answer from it.",
    category: "Product",
    author: "Rishi Bansal",
    role: "AI Engineer",
    date: "14 April 2026",
    isoDate: "2026-04-14",
    readTime: "8 min read",
    motif: "doc",
    intro:
      "\"The AI answers from your documents\" is a sentence every platform in this category prints. This is what it means here, step by step, including the part where it tells you which document it used.",
    sections: [
      {
        heading: "Upload and extraction",
        body: [
          "A document arrives as a PDF, DOCX, text file or a URL. The first job is turning it into clean text — and this is where naive implementations lose most of their accuracy, because a pricing table flattened into a run-on line is worse than useless.",
          "WhatsCRM converts documents to structured Markdown so tables stay tables and scanned pages are read rather than skipped, with a local extractor as a fallback when that service is unavailable.",
        ],
      },
      {
        heading: "Chunking and indexing",
        body: [
          "The text is split into overlapping passages and each is embedded into a vector index. The overlap matters: a policy that spans a paragraph break should not be findable only by half of itself.",
          "Every stored passage carries the workspace and the business it belongs to, and every search filters on both. Isolation is a property of the query, not a promise in a settings page.",
        ],
      },
      {
        heading: "Retrieval, before generation",
        body: [
          "When a customer asks something, the question is embedded and the closest passages are retrieved first. Only then is the model asked to write, with those passages in front of it.",
          "The order is the whole point. A model asked to answer and then check itself will confabulate; a model handed the relevant paragraph and asked to answer from it will mostly quote it.",
        ],
      },
      {
        heading: "The citation",
        body: [
          "The documents a reply drew on are written onto the message at the moment it is sent, and shown under the reply in the inbox.",
          "They are recorded rather than recomputed later on purpose. Retrieval depends on the index as it stood at that moment, so re-running the search after a document was edited would answer a different question than the one the customer actually got.",
          "This is what makes a wrong answer fixable. Without the citation, 'the AI said something incorrect' is an unanswerable complaint. With it, you know which file to open.",
        ],
      },
      {
        heading: "When to use a curated answer instead",
        body: [
          "Retrieval is the right tool for open questions. For the twenty things customers ask constantly, a human-approved answer is better — faster, exact, and incapable of inventing a price.",
          "Sending those as a tappable list has a second benefit: the tap tells you which question the customer chose, from a list, inside their own conversation. That is a stronger intent signal than any page view.",
        ],
      },
    ],
  },
];

/** Newest first. The listing and the related rail both want the same order. */
export function listPosts(): Post[] {
  return [...POSTS].sort((a, b) => b.isoDate.localeCompare(a.isoDate));
}

export function getPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.slug === slug);
}

/**
 * Up to `limit` posts to show beneath an article.
 *
 * Same category first, then whatever is newest, so a short category still fills the
 * rail rather than rendering one lonely card.
 */
export function getRelated(slug: string, limit = 3): Post[] {
  const current = getPost(slug);
  if (!current) return listPosts().slice(0, limit);

  const others = listPosts().filter((post) => post.slug !== slug);
  const sameCategory = others.filter((post) => post.category === current.category);
  const rest = others.filter((post) => post.category !== current.category);

  return [...sameCategory, ...rest].slice(0, limit);
}

/** Post counts per category, for the sidebar. */
export function categoryCounts(): { category: PostCategory; count: number }[] {
  return CATEGORIES.map((category) => ({
    category,
    count: POSTS.filter((post) => post.category === category).length,
  }));
}
