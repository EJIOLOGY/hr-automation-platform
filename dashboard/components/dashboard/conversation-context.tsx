"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface ConversationContextValue {
  selectedConversationId: string | null;
  selectConversation: (conversationId: string) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const value = useMemo(
    () => ({
      selectedConversationId,
      selectConversation: setSelectedConversationId,
    }),
    [selectedConversationId],
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversationSelection() {
  const context = useContext(ConversationContext);

  if (!context) {
    throw new Error("Conversation selection must be used within its provider.");
  }

  return context;
}
