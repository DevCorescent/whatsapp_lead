// Re-export Prisma types for convenience
export type {
  Tenant,
  TenantSettings,
  User,
  Contact,
  Tag,
  ContactTag,
  Conversation,
  Message,
  Lead,
  LeadActivity,
  PipelineStage,
  MessageTemplate,
  Campaign,
  CampaignContact,
  ChatbotFlow,
  Ticket,
  KnowledgeDoc,
  Plan,
  Subscription,
  AuditLog,
  QuickReply,
  UserRole,
  ConversationStatus,
  MessageType,
  MessageDirection,
  MessageStatus,
  StageOutcome,
  LeadScoreLabel,
  CampaignStatus,
  TicketStatus,
  TicketPriority,
  SubscriptionStatus,
  BillingCycle,
} from "@prisma/client";

// ─── API Response Wrapper ─────────────────────────────────────────────────────
export type ApiResponse<T = unknown> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Dashboard / Analytics ────────────────────────────────────────────────────
export interface DashboardStats {
  totalLeads: number;
  qualifiedLeads: number;
  activeConversations: number;
  totalContacts: number;
  conversionRate: number;
  campaignsSent: number;
  openTickets: number;
  messagesThisMonth: number;
}

// ─── WhatsApp Webhook Payload (Meta) ─────────────────────────────────────────
export interface WAWebhookPayload {
  object: string;
  entry: WAEntry[];
}

export interface WAEntry {
  id: string;
  changes: WAChange[];
}

export interface WAChange {
  value: WAChangeValue;
  field: string;
}

export interface WAChangeValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WAContact[];
  messages?: WAMessage[];
  statuses?: WAStatus[];
}

export interface WAContact {
  profile: { name: string };
  wa_id: string;
}

export interface WAMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string };
  location?: { latitude: number; longitude: number };
  button?: { payload: string; text: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface WAStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

// ─── Kanban / Lead Pipeline ───────────────────────────────────────────────────
export interface KanbanColumn {
  id: string;
  title: string;
  /** PipelineStage id this column represents. */
  stageId: string;
  color: string;
  leads: import("@prisma/client").Lead[];
}
