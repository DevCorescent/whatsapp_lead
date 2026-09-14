// ============================================================================
// MODULE : Website CMS — icon vocabulary
// ============================================================================
//
// The icons an admin can pick for a card, step or integration. Names only, with
// no React in this file, so the server-side validator can import it without
// pulling lucide into an API route. components/marketing/home/cmsIcon.tsx maps
// each name to its component; adding an icon means adding it in both places.

export const CMS_ICON_NAMES = [
  "MessageSquare",
  "MessageCircle",
  "MessagesSquare",
  "Inbox",
  "Send",
  "Bot",
  "Brain",
  "Sparkles",
  "Wand2",
  "Zap",
  "Target",
  "Gauge",
  "TrendingUp",
  "BarChart3",
  "Users",
  "UserCheck",
  "UserCog",
  "UserX",
  "Workflow",
  "Route",
  "BookOpen",
  "Megaphone",
  "Ticket",
  "ShieldCheck",
  "BadgeCheck",
  "CircleCheck",
  "ListChecks",
  "Clock",
  "AlarmClock",
  "Bell",
  "FileText",
  "FileSpreadsheet",
  "Image",
  "Video",
  "Mic",
  "MapPin",
  "List",
  "MousePointerClick",
  "LayoutTemplate",
  "Type",
  "Link",
  "Webhook",
  "Code2",
  "Plug",
  "Database",
  "Mail",
  "Phone",
  "Globe",
  "Languages",
  "Lock",
  "Heart",
  "Star",
  "Smile",
  "Rocket",
  "Building2",
  "Store",
  "CreditCard",
  "Calendar",
  "Search",
  "Filter",
  "Tag",
  "Layers",
  "Handshake",
  "Headphones",
] as const;

export type CmsIconName = (typeof CMS_ICON_NAMES)[number];

export function isCmsIconName(value: unknown): value is CmsIconName {
  return typeof value === "string" && (CMS_ICON_NAMES as readonly string[]).includes(value);
}
