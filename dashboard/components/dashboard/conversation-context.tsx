"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Conversation } from "@/lib/dashboard-api";

interface ConversationContextValue {
  selectedConversationId: string | null;
  selectedConversation: Conversation | null;
  selectConversation: (conversation: Conversation) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const value = useMemo(
    () => ({
      selectedConversationId: selectedConversation?.id ?? null,
      selectedConversation,
      selectConversation: setSelectedConversation,
    }),
    [selectedConversation],
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
