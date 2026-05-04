import { inngest } from "@/inngest/client";
import { createAgent, createNetwork, gemini } from "@inngest/agent-kit";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError, type EventPayload, type JsonError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import {
  CODING_AGENT_SYSTEM_PROMPT,
  TITLE_GENERATOR_SYSTEM_PROMPT,
} from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { createReadFilesTool } from "./tools/read-files";
import { createListFilesTool } from "./tools/list-files";
import { createUpdateFileTool } from "./tools/update-file";
import { createCreateFilesTool } from "./tools/create-files";
import { createCreateFolderTool } from "./tools/create-folder";
import { createRenameFileTool } from "./tools/rename-file";
import { createDeleteFileTool } from "./tools/delete-files";
import { createScrapeUrlsTool } from "./tools/scrape-urls";

interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  message: string;
  function_id?: string;
  run_id?: string;
  error?: JsonError;
  event?: EventPayload<any>;
}

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    retries: 0,
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

      // Atualizar a messagem com o conteúdo de erro
      if (internalKey) {
        await step?.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content:
              "Não foi possível processar sua messagem. Limite de solicitações atingido, tente novamente mais tarde.",
          });
        });
      }
    },
  },
  {
    event: "message/sent",
  },
  async ({ event, step }) => {
    const { messageId, conversationId, projectId, message } =
      event.data as MessageEvent;

    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!internalKey) {
      throw new NonRetriableError(
        "POLARIS_CONVEX_INTERNAL_KEY is not configured",
      );
    }

    // TODO: Verificar se isso é necessário
    await step.sleep("wait-for-db-sync", "1s");

    // Pegar o conteúdo da conversa para gerar o título
    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    // Buscar pelas mesagens recentes para o contexto da conversa
    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 5,
      });
    });

    // Criar um prompt do sistema com o histórico da conversa (excluirá a mensagem do processo atual)
    let systemPrompt = CODING_AGENT_SYSTEM_PROMPT;

    // Filtrar a mensagem de processamento atual e as mensagens vazias
    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== "",
    );

    if (contextMessages.length > 0) {
      const historyText = contextMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");

      systemPrompt += `\n\n## Previous Conversation (for context only - do NOT repeat these responses):\n${historyText}\n\n## Current Request:\nRespond ONLY to the user's new message below. Do not repeat or reference your previous responses.`;
    }

    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
      const titleAgent = createAgent({
        name: "title-generator",
        system: TITLE_GENERATOR_SYSTEM_PROMPT,
        model: gemini({
          model: "gemini-2.5-flash",
          apiKey: googleApiKey,
        }),
      });

      const { output } = await titleAgent.run(message, { step });

      const textMessage = output.find(
        (m) => m.type === "text" && m.role === "assistant",
      );

      if (textMessage?.type === "text") {
        const title =
          typeof textMessage.content === "string"
            ? textMessage.content.trim()
            : textMessage.content
                .map((c) => c.text)
                .join("")
                .trim();

        if (title) {
          await step.run("update-conversation-title", async () => {
            await convex.mutation(api.system.updateConversationTitle, {
              internalKey,
              conversationId,
              title,
            });
          });
        }
      }
    }

    // Criar o agente de código com ferramentas de arquivo
    const condingAgent = createAgent({
      name: "polaris",
      description: "Um agente de código especializado",
      system: systemPrompt,
      model: gemini({
        model: "gemini-2.5-flash",
        apiKey: googleApiKey,
      }),
      tools: [
        createListFilesTool({ internalKey, projectId }),
        createReadFilesTool({ internalKey }),
        createUpdateFileTool({ internalKey }),
        createCreateFilesTool({ projectId, internalKey }),
        createCreateFolderTool({ projectId, internalKey }),
        createRenameFileTool({ internalKey }),
        createDeleteFileTool({ internalKey }),
        createScrapeUrlsTool(),
      ],
    });

    // Criar rede com agente único
    const network = createNetwork({
      name: "polaris-network",
      agents: [condingAgent],
      maxIter: 0,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        const hasTextResponse = lastResult?.output.some(
          (m) => m.type === "text" && m.role === "assistant",
        );
        const hasToolCalls = lastResult?.output.some(
          (m) => m.type === "tool_call",
        );

        // Gemini retorna o texto E a chamada de ferramenta juntos
        // Pare somente se houver texto SEM chamadas de ferramenta (resposta final)
        if (hasTextResponse && !hasToolCalls) {
          return undefined;
        }

        return condingAgent;
      },
    });

    // Executar a agente
    const result = await network.run(message);

    // Extrair a resposta de texto do assistente do último resultado do agente
    const lastResult = result.state.results.at(-1);
    const textMessage = lastResult?.output.find(
      (m) => m.type === "text" && m.role === "assistant",
    );

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    if (textMessage?.type === "text") {
      assistantResponse =
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join("");
    }

    // Atualizar a mensagem do assistente com a resposta ( isso também define o status como concluído )
    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      });
    });

    return { success: true, messageId, conversationId };
  },
);
