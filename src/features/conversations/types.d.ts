import type { Id } from "../../../convex/_generated/dataModel";
import { EventPayload } from "inngest";
import { inngest } from "@/inngest/client";

type Step = Parameters<Parameters<typeof inngest.createFunction>[2]>[0]["step"];

export interface inngestOutputEvents {
  event: EventPayload<any>;
  step: Step;
}

export interface RecentMessageProps {
  _id: Id<"messages">;
  _creationTime: number;
  status?: "completed" | "cancelled" | "processing" | undefined;
  projectId: Id<"projects">;
  content: string;
  conversationId: Id<"conversations">;
  role: "user" | "assistant";
}

export interface TextMessageProps {
  type: "text" | "tool_call";
  role: "system" | "user" | "assistant";
  content: string | { text: string }[];
}

export interface NetworkResponseProps {
  network: {
    state: {
      results: {
        output: TextMessageProps[];
      }[];
    };
  };
}
