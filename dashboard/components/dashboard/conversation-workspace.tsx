"use client";

import { MessageSquareText } from "lucide-react";
import { useConversationSelection } from "./conversation-context";

export function ConversationWorkspace() {
  const { selectedConversationId } = useConversationSelection();

  return (
    <div className="flex h-full min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageSquareText className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Select a conversation</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {selectedConversationId
            ? "Conversation selected. Message history will be available here in a future phase."
            : "Select a conversation from the inbox to view the conversation."}
        </p>
      </div>
    </div>
  );
}
