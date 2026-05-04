import ky from "ky";
import { toast } from "sonner";
import { useState } from "react";
import {
  CopyIcon,
  HistoryIcon,
  PlusIcon,
  ArrowBigRightDash,
} from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";

import {
  useConversation,
  useConversations,
  useCreateConversation,
  useMessages,
} from "../hooks/use-conversations";

import type { Id } from "../../../../convex/_generated/dataModel";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import Image from "next/image";
import { PastConversationsDialog } from "./past-conversations-dialog";

interface ConversationSidebarProps {
  projectId: Id<"projects">;
}

export const ConversationSidebar = ({
  projectId,
}: ConversationSidebarProps) => {
  const [input, setInput] = useState("");
  const [selectedConversationId, setSelectedConversationId] =
    useState<Id<"conversations"> | null>(null);

  const [pastConversationOpen, setPastConversationOpen] = useState(false);
  const [addConversationButton, setAddConversationButton] = useState(false);

  const createConversation = useCreateConversation();
  const conversations = useConversations(projectId);

  const activeConversationId =
    selectedConversationId ?? conversations?.[0]?._id ?? null;

  const activeConversation = useConversation(activeConversationId);
  const conversationMessages = useMessages(activeConversationId);

  //verifica se alguma está processando alguma mensagem
  const isProcessing = conversationMessages?.some(
    (msg) => msg.status === "processing",
  );

  const handleCancel = async () => {
    try {
      await ky.post("/api/messages/cancel", {
        json: { projectId },
      });
    } catch {
      toast.error("Não foi possível cancelar o pedido");
    }
  };

  const handleCreateConversation = async () => {
    if (conversations?.length === 10) {
      setAddConversationButton(true);
      return null;
    }

    try {
      const newconversationId = await createConversation({
        projectId,
        title: DEFAULT_CONVERSATION_TITLE,
      });
      setSelectedConversationId(newconversationId);

      return newconversationId;
    } catch {
      toast.error("Erro ao criar nova conversa");
      return null;
    }
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    // Se a conversa estiver processando e não tiver mensagens, para a função
    if (isProcessing && !message.text) {
      await handleCancel();
      setInput("");
      return;
    }

    let conversationId = activeConversationId;

    if (!conversationId) {
      conversationId = await handleCreateConversation();
      if (!conversationId) return;
    }

    // Gatilho Inngest via API
    try {
      await ky.post("/api/messages", {
        json: {
          conversationId,
          message: message.text,
        },
      });
    } catch {
      toast.error("Erro ao enviar mensagem");
    }

    setInput("");
  };

  return (
    <>
      <PastConversationsDialog
        projectId={projectId}
        open={pastConversationOpen}
        onOpenChange={setPastConversationOpen}
        onSelect={setSelectedConversationId}
      />

      <div className="flex flex-col h-full bg-sidebar">
        <div className="h-8.75 flex items-center justify-between border-b">
          <span className="text-sm truncate pl-3.5">
            {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
          </span>
          <div className="flex items-center px-1 gap-1">
            <Button
              size="icon-xs"
              variant="highlight"
              onClick={() => setPastConversationOpen(true)}
            >
              <HistoryIcon className="size-3.5" />
            </Button>
            <Button
              size="icon-xs"
              variant="highlight"
              onClick={handleCreateConversation}
              disabled={addConversationButton}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        <Conversation className="flex-1">
          <ConversationContent>
            {conversationMessages?.map((message, messageIndex) => (
              <Message key={message._id} from={message.role}>
                <MessageContent>
                  {message.status === "processing" ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="animate-pulse flex items-center justify-center flex-row gap-1">
                        <Image
                          src="/logo.svg"
                          alt="Polaris Logo"
                          width={50}
                          height={50}
                          className="size-4"
                        />
                        <span>Pensando...</span>
                      </div>
                    </div>
                  ) : message.status === "cancelled" ? (
                    <span className="text-muted-foreground italic">
                      Mensagem cancelada
                    </span>
                  ) : (
                    <MessageResponse>{message.content}</MessageResponse>
                  )}
                </MessageContent>

                {message.role === "assistant" &&
                  message.status === "completed" &&
                  messageIndex === (conversationMessages?.length ?? 0) - 1 && (
                    <MessageActions>
                      <MessageAction
                        onClick={() => {
                          navigator.clipboard.writeText(message.content);
                        }}
                        label="Copiar"
                      >
                        <CopyIcon className="size-3.5" />
                      </MessageAction>
                    </MessageActions>
                  )}
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="p-3">
          <PromptInput onSubmit={handleSubmit} className="mt-2">
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Digite sua pergunta aqui..."
                onChange={(e) => setInput(e.target.value)}
                value={input}
                disabled={isProcessing}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit
                disabled={isProcessing ? false : !input}
                status={isProcessing ? "streaming" : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </>
  );
};
