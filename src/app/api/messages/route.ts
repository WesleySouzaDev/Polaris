import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string(),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      {
        status: 500,
      },
    );
  }

  const body = await request.json();
  const { conversationId, message } = requestSchema.parse(body);

  // Chamar convex mutation, query
  const conversation = await convex.query(api.system.getConversationById, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const projectId = conversation.projectId;

  //TODO: Verificação para o processamento das messagens

  //Criar user message
  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "user",
    content: message,
  });

  // Criar assistente de menssagem no placeholder com status do processo
  const assistantMessageId = await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "assistant",
    content: "",
    status: "processing",
  });

  // TODO: Implementar Inngest para o processamento da menssagem
  const event = await inngest.send({
    name: "message/sent",
    data: {
      messageId: assistantMessageId,
    },
  });

  return NextResponse.json({
    success: true,
    eventId: event.ids[0],
    messageId: assistantMessageId,
  });

  // Implementar Inngest background jobs
}
