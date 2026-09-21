"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  Bot,
  MessageSquareText,
  RefreshCw,
  SendHorizontal,
  UserRound,
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
import { useRealtime } from "./realtime-provider";

const COMPOSER_MIN_HEIGHT = 44;
const COMPOSER_MAX_HEIGHT = 112;

function resizeComposer(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(
    Math.max(textarea.scrollHeight, COMPOSER_MIN_HEIGHT),
    COMPOSER_MAX_HEIGHT,
  )}px`;
}

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
  const [refreshSignal, setRefreshSignal] = useState(0);
  const messageHistoryRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { joinConversation, leaveConversation, on } = useRealtime();

  const selectedConversationId = selectedConversation?.id ?? null;

  // Join the room for the open conversation so the gateway only pushes
  // signals for the thread actually being viewed; leave it on switch/unmount.
  useEffect(() => {
    if (!selectedConversationId) return;

    joinConversation(selectedConversationId);

    return () => {
      leaveConversation(selectedConversationId);
    };
  }, [selectedConversationId, joinConversation, leaveConversation]);

  useEffect(() => {
    return on("conversation:new-message", (...args: unknown[]) => {
      const payload = args[0] as { sessionId?: string } | undefined;

      if (payload?.sessionId && payload.sessionId === selectedConversationId) {
        setRefreshSignal((count) => count + 1);
      }
    });
  }, [on, selectedConversationId]);

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

  // Keep the conversation viewport at the latest message after the initial
  // load, a realtime refresh, or an HR message sent from the composer.
  useEffect(() => {
    const container = messageHistoryRef.current;

    if (!container || messages === null) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [messages, selectedConversationId]);

  // Reset the composer height whenever its controlled value is cleared,
  // such as after sending a message or switching conversations.
  useEffect(() => {
    if (!composerRef.current) {
      return;
    }

    if (!draft) {
      composerRef.current.style.height = `${COMPOSER_MIN_HEIGHT}px`;
      return;
    }

    resizeComposer(composerRef.current);
  }, [draft]);

  // Silent refresh: a new message arrived for the open conversation. Fetch
  // quietly and append/replace without flashing the loading skeleton —
  // that would interrupt someone actively reading or typing a reply.
  useEffect(() => {
    if (refreshSignal === 0 || !selectedConversation || !accessToken) {
      return;
    }

    let active = true;

    async function silentlyRefresh() {
      if (!selectedConversation || !accessToken) return;

      try {
        const response = await getConversationMessages(
          selectedConversation.id,
          accessToken,
        );

        if (active) setMessages(response.items);

        void markConversationRead(selectedConversation.id, accessToken);
      } catch (err) {
        if (!active || !(err instanceof ApiError) || err.status !== 401) {
          return;
        }

        try {
          const newToken = await refreshAuth();

          if (!active || !newToken || !selectedConversation) return;

          const response = await getConversationMessages(
            selectedConversation.id,
            newToken,
          );

          if (active) setMessages(response.items);

          void markConversationRead(selectedConversation.id, newToken);
        } catch {
          // Non-critical — the next signal or a manual retry will recover.
        }
      }
    }

    void silentlyRefresh();

    return () => {
      active = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

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

      {/* Conversation body — wallpaper covers messages and composer */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[url('/tertiary-telegram-wallpaper.png')] bg-cover bg-center bg-no-repeat">
        {/* Soft wallpaper layer */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 scale-[1.02] bg-[url('/tertiary-telegram-wallpaper.png')] bg-cover bg-center bg-no-repeat blur-[0.2px]"
        />

        {/* Message history */}
        <div
          ref={messageHistoryRef}
          className={cn(
            "relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-4",
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

        {/* Reply composer — floats over the wallpaper */}
        <form
          onSubmit={handleSubmit}
          className="relative z-20 shrink-0 bg-transparent px-5 py-3"
        >
          {sendError ? (
            <p
              role="alert"
              className="mb-2 text-[13px] leading-5 text-[#C94B4B]"
            >
              {sendError}
            </p>
          ) : null}

          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="conversation-reply">
              Reply to {selectedConversation.employee.fullName}
            </label>

            <textarea
              ref={composerRef}
              id="conversation-reply"
              value={draft}
              onChange={(event) => {
                resizeComposer(event.currentTarget);
                setDraft(event.target.value);
              }}
              placeholder={
                canReply
                  ? "Type a reply"
                  : " Replies are only available when this escalation is assigned to you...."
              }
              disabled={!canReply || isSending}
              rows={1}
              maxLength={2000}
              className="max-h-28 min-h-11 flex-1 resize-none overflow-y-auto rounded-[22px] border border-[#D9E0E7] bg-white px-4 py-2.5 text-[14px] leading-5 text-[#172033] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] outline-none placeholder:text-[#687586] focus:border-[#3F80E0] focus:ring-2 focus:ring-[#3F80E0]/20 disabled:cursor-not-allowed disabled:bg-[#F1F4F7]"
            />

            <button
              type="submit"
              disabled={!canReply || !draft.trim() || isSending}
              aria-label="Send reply"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0057B8] text-white shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#3F80E0] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <SendHorizontal className="size-4" aria-hidden="true" />
            </button>
          </div>
          
        </form>
      </div>
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
        const isEmployeeMessage = message.direction === "INBOUND";

        const isHrMessage =
          message.direction === "OUTBOUND" &&
          Boolean(message.sentByHrOfficerId);

        const previousMessage = messages[index - 1];

        const previousSenderKey = previousMessage
          ? (previousMessage.sentByHrOfficerId ?? previousMessage.direction)
          : null;

        const currentSenderKey = message.sentByHrOfficerId ?? message.direction;

        const senderChanged =
          previousMessage && previousSenderKey !== currentSenderKey;

        const displayContent = formatConversationContent(
          message.displayContent ?? message.content,
        );

        return (
          <div
            key={message.id}
            className={cn(
              "flex",
              isEmployeeMessage ? "justify-start" : "justify-end",
              index === 0 ? "" : senderChanged ? "mt-3" : "mt-1.5",
            )}
          >
            <article
              className={cn(
                "min-w-0 max-w-[75%] rounded-[14px] border px-3.5 py-2.5 shadow-sm",
                isEmployeeMessage
                  ? "border-[#E3E8EE] bg-white text-[#172033]"
                  : "border-[#CFE5E3] bg-[linear-gradient(135deg,#EAF5FF_0%,#D6F3EE_100%)] text-[#172033]",
              )}
            >
              {!isEmployeeMessage ? (
                <div
                  className={cn(
                    "mb-1 flex items-center gap-1.5 text-[12px] font-semibold leading-4",
                    isHrMessage ? "text-[#0B6B63]" : "text-[#0057B8]",
                  )}
                >
                  {isHrMessage ? (
                    <UserRound className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Bot className="size-3.5" aria-hidden="true" />
                  )}

                  <span>
                    {isHrMessage
                      ? message.sentByHrOfficer?.fullName || "HR Personnel"
                      : "Bot"}
                  </span>
                </div>
              ) : null}

              <p className="whitespace-pre-wrap wrap-break-word text-[14px] leading-5">
                {displayContent}
              </p>

              <time
                dateTime={message.createdAt}
                className="float-right ml-2 mt-1 text-[11px] leading-4 tabular-nums text-[#687586]"
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

function formatConversationContent(content: string) {
  return content
    .replace(/^HR_QUEUE_ENGAGEMENT:\s*/i, "")
    .replace(/^HR_QUEUE:\s*/i, "")
    .replace(/^ESCALATION:\s*/i, "")
    .trim();
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
