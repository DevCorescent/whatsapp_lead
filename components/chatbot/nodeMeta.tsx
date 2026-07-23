"use client";

import {
  Zap,
  MessageSquare,
  HelpCircle,
  GitBranch,
  Webhook,
  Clock,
  UserCheck,
  Sparkles,
  Flag,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "@/lib/chatbot/types";

/** Client-side icon mapping for each node kind. Kept out of lib/chatbot/types.ts so
 *  that module stays framework-free and usable server-side. */
export const NODE_ICON: Record<NodeKind, LucideIcon> = {
  start: Zap,
  message: MessageSquare,
  question: HelpCircle,
  condition: GitBranch,
  api: Webhook,
  delay: Clock,
  handoff: UserCheck,
  ai: Sparkles,
  end: Flag,
};
