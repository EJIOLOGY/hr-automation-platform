"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  MessageSquareText,
  RefreshCw,
  SendHorizontal,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  type ConversationMessage,
} from "@/lib/dashboard-api";
import { ApiError } from "@/lib/auth-api";
import { cn } from "@/lib/utils";
import { useConversationSelection } from "./conversation-context";

export function ConversationWorkspace() {
  const { selectedConversation } = useConversationSelection();
  const { accessToken, refreshAuth, user } = useAuth();

  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMessages() {
      if (!selectedConversation || !accessToken) {
        if (active) {
          setMessages(null);
          setHasError(false);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setHasError(false);
      setMessages(null);
      setDraft("");
      setSendError("");

      try {
        const response = await getConversationMessages(
          selectedConversation.id,
          accessToken,
        );

        if (active) {
          setMessages(response.items);
        }

        void markConversationRead(selectedConversation.id, accessToken);
      } catch (error) {
        if (!active) return;

        if (error instanceof ApiError && error.status === 401) {
          const refreshedToken = await refreshAuth();

          if (!active || !refreshedToken) {
            setHasError(true);
            return;
          }

          try {
            const response = await getConversationMessages(
              selectedConversation.id,
              refreshedToken,
            );

            if (active) {
              setMessages(response.items);
            }

            void markConversationRead(selectedConversation.id, refreshedToken);
          } catch {
            if (active) {
              setHasError(true);
            }
          }
        } else {
          setHasError(true);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadMessages();

    return () => {
      active = false;
    };
  }, [accessToken, refreshAuth, retryCount, selectedConversation]);

  const canReply = Boolean(
    selectedConversation?.activeEscalation?.status === "IN_PROGRESS" &&
    selectedConversation.activeEscalation.assignedHrOfficerId === user?.id,
  );

  const employeeInitials = useMemo(() => {
    if (!selectedConversation) return "";

    return selectedConversation.employee.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name[0])
      .join("")
      .toUpperCase();
  }, [selectedConversation]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();

    if (!content || !selectedConversation || !accessToken || !canReply) {
      return;
    }

    try {
      setIsSending(true);
      setSendError("");

      const message = await sendConversationMessage(
        selectedConversation.id,
        content,
        accessToken,
      );

      setMessages((current) => (current ? [...current, message] : [message]));

      setDraft("");
    } catch {
      setSendError("Your reply could not be sent. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  if (!selectedConversation) {
    return <EmptyConversationState />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F9FC]">
      {/* Tertiary conversation header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[#E3E8EE] bg-white px-5 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-sm font-semibold text-[#0057B8]">
          {employeeInitials}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[16px] font-semibold leading-5 text-[#172033]">
              {selectedConversation.employee.fullName}
            </h1>

            {selectedConversation.activeEscalation ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF5DF] px-2 py-0.5 text-[12px] font-medium leading-4 text-[#E6A21A]">
                <AlertTriangle className="size-3" aria-hidden="true" />
                Escalated
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 truncate text-[13px] leading-5 text-[#687586]">
            {selectedConversation.employee.employeeNumber} ·{" "}
            {selectedConversation.employee.jobTitle}
          </p>
        </div>

        <span className="hidden shrink-0 text-[13px] leading-5 text-[#687586] lg:inline">
          {selectedConversation.employee.department}
        </span>
      </header>

      {/* Message history */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto bg-[#F7F9FC] px-5 py-4",
          "scrollbar-thin",
          "[scrollbar-color:#C4C4C4_transparent]",
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-[#C4C4C4]",
          "[&::-webkit-scrollbar-thumb:hover]:bg-[#A8A8A8]",
        )}
      >
        {isLoading ? <MessageHistorySkeleton /> : null}

        {hasError ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-[15px] font-semibold leading-5 text-[#172033]">
              Couldn’t load messages
            </p>

            <p className="mt-1 text-[14px] leading-5 text-[#687586]">
              Please try again in a moment.
            </p>

            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#D9E0E7] px-3 py-2 text-[14px] font-medium text-[#172033] transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-[#3F80E0]"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : null}

        {messages?.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquareText
              className="size-7 text-[#687586]"
              aria-hidden="true"
            />

            <p className="mt-3 text-[15px] font-semibold leading-5 text-[#172033]">
              No messages yet
            </p>

            <p className="mt-1 text-[14px] leading-5 text-[#687586]">
              Messages in this conversation will appear here.
            </p>
          </div>
        ) : null}

        {messages ? <MessageHistory messages={messages} /> : null}
      </div>

      {/* Reply composer */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-[#E3E8EE] bg-white px-5 py-3"
      >
        {sendError ? (
          <p role="alert" className="mb-2 text-[13px] leading-5 text-[#C94B4B]">
            {sendError}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="conversation-reply">
            Reply to {selectedConversation.employee.fullName}
          </label>

          <textarea
            id="conversation-reply"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={canReply ? "Type a reply" : "Reply unavailable"}
            disabled={!canReply || isSending}
            rows={1}
            maxLength={2000}
            className="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-[#D9E0E7] bg-white px-3 py-2.5 text-[14px] leading-5 text-[#172033] outline-none placeholder:text-[#687586] focus:border-[#3F80E0] focus:ring-2 focus:ring-[#3F80E0]/20 disabled:cursor-not-allowed disabled:bg-[#F1F4F7]"
          />

          <button
            type="submit"
            disabled={!canReply || !draft.trim() || isSending}
            aria-label="Send reply"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#0057B8] text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#3F80E0] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <SendHorizontal className="size-4" aria-hidden="true" />
          </button>
        </div>

        {!canReply ? (
          <p className="mt-2 text-[13px] leading-5 text-[#687586]">
            Replies are available when this escalation is assigned to you.
          </p>
        ) : null}
      </form>
    </div>
  );
}

function EmptyConversationState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[#F7F9FC] p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#EAF5FF] text-[#0057B8]">
          <MessageSquareText className="size-5" aria-hidden="true" />
        </span>

        <h1 className="mt-4 text-lg font-semibold tracking-tight text-[#172033]">
          Select a conversation
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#687586]">
          Select a conversation from the inbox to view the conversation.
        </p>
      </div>
    </div>
  );
}

function MessageHistory({ messages }: { messages: ConversationMessage[] }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      {messages.map((message, index) => {
        const isOutbound = message.direction === "OUTBOUND";

        const previousMessage = messages[index - 1];

        const senderChanged =
          previousMessage && previousMessage.direction !== message.direction;

        return (
          <div
            key={message.id}
            className={cn(
              "flex",
              isOutbound ? "justify-end" : "justify-start",
              index === 0 ? "" : senderChanged ? "mt-3" : "mt-1.5",
            )}
          >
            <article
              className={cn(
                "min-w-0 max-w-[75%] rounded-xl border px-3.5 py-2.5 shadow-sm",
                isOutbound
                  ? "border-[#D6E7EA] bg-[linear-gradient(135deg,#EAF5FF_0%,#E2F7F4_100%)] text-[#172033]"
                  : "border-[#E3E8EE] bg-white text-[#172033]",
              )}
            >
              <p className="whitespace-pre-wrap break-words text-[14px] leading-5">
                {message.content}
              </p>

              <time
                dateTime={message.createdAt}
                className="mt-1 block text-right text-[11px] leading-4 tabular-nums text-[#687586]"
              >
                {formatMessageTimestamp(message.createdAt)}
              </time>
            </article>
          </div>
        );
      })}
    </div>
  );
}

function MessageHistorySkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-3">
      <div className="h-18 w-3/5 animate-pulse rounded-xl bg-[#E8EDF2]" />
      <div className="ml-auto h-14 w-1/2 animate-pulse rounded-xl bg-[#E8EDF2]" />
      <div className="h-24 w-2/3 animate-pulse rounded-xl bg-[#E8EDF2]" />
    </div>
  );
}

function formatMessageTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
