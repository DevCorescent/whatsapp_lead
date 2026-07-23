import {
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  MousePointerClick,
  FormInput,
  UserCheck,
  Flag,
} from "lucide-react";
import type { NodeType } from "@/lib/chatbot";

/** Lucide icon for each node type — kept out of lib/chatbot.ts so that module stays UI-free. */
export const NODE_ICON: Record<NodeType, React.ComponentType<{ className?: string }>> = {
  start: Play,
  send_message: MessageSquare,
  ask_question: HelpCircle,
  keyword_condition: GitBranch,
  button_choice: MousePointerClick,
  collect_input: FormInput,
  assign_agent: UserCheck,
  end: Flag,
};
