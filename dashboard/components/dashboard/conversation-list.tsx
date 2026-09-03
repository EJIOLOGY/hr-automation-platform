"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, MessageSquare, RefreshCw, Search } from "lucide-react";
import { getConversations, type Conversation } from "@/lib/dashboard-api";
import { ApiError } from "@/lib/auth-api";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { useConversationSelection } from "./conversation-context";

type ConversationFilter = "all" | "unread" | "escalated";

const filters: { label: string; value: ConversationFilter }[] = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Escalated", value: "escalated" },
];

function isUnread(conversation: Conversation) {
  const { latestMessage, lastReadByHrAt } = conversation;

  return Boolean(
    latestMessage?.direction === "INBOUND" &&
    (!lastReadByHrAt ||
      new Date(latestMessage.createdAt) > new Date(lastReadByHrAt)),
  );
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return new Intl.DateTimeFormat(
    undefined,
    sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" },
  ).format(date);
}

function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
}

function ConversationListSkeleton() {
  return (
    <div className="divide-y divide-border" aria-label="Loading conversations">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex gap-3 px-1 py-4">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>

          <div className="h-3 w-9 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ConversationListItem({
  conversation,
}: {
  conversation: Conversation;
}) {
  const { selectedConversationId, selectConversation } =
    useConversationSelection();

  const unread = isUnread(conversation);
  const isSelected = selectedConversationId === conversation.id;
  const preview = conversation.latestMessage?.content || "No messages yet";

  return (
    <button
      type="button"
      onClick={() => selectConversation(conversation)}
      aria-pressed={isSelected}
      className={cn(
        "flex w-full min-w-0 gap-3 border-b border-border px-0 py-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-inset",
        isSelected && "bg-primary/8",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[14px] leading-none font-medium text-primary">
        {initials(conversation.employee.fullName)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[15px] leading-5",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {conversation.employee.fullName}
          </span>

          <span className="shrink-0 text-[12px] leading-4 tabular-nums text-muted-foreground">
            {formatTimestamp(conversation.lastActivityAt)}
          </span>
        </span>

        <span className="mt-1 flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-muted-foreground">
            {preview}
          </span>

          {conversation.activeEscalation ? (
            <AlertTriangle
              className="size-3.5 shrink-0 text-warning"
              aria-label="Escalated conversation"
            />
          ) : null}

          {unread ? (
            <span
              className="size-2 shrink-0 rounded-full bg-info"
              aria-label="Unread"
            />
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function ConversationList() {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId");

  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");

  const { accessToken, refreshAuth } = useAuth();
  const { selectConversation } = useConversationSelection();

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(null);
    setError(false);

    async function loadConversations() {
      if (!accessToken) {
        if (active) setError(true);
        return;
      }

      try {
        const response = await getConversations(accessToken);

        if (active) {
          setConversations(response.items);
        }
      } catch (err) {
        if (!active) return;

        if (err instanceof ApiError && err.status === 401) {
          try {
            const newToken = await refreshAuth();

            if (!active || !newToken) {
              setError(true);
              return;
            }

            const response = await getConversations(newToken);

            if (active) {
              setConversations(response.items);
            }
          } catch {
            if (active) setError(true);
          }
        } else {
          if (active) setError(true);
        }
      }
    }

    void loadConversations();

    return () => {
      active = false;
    };
  }, [accessToken, refreshAuth, retryCount]);

  useEffect(() => {
    if (!conversationId || !conversations) {
      return;
    }

    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );

    if (conversation) {
      selectConversation(conversation);
    }
  }, [conversationId, conversations, selectConversation]);

  const visibleConversations = useMemo(() => {
    if (!conversations) return [];

    const normalizedQuery = query.trim().toLocaleLowerCase();

    return conversations.filter((conversation) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          conversation.employee.fullName,
          conversation.employee.employeeNumber,
          conversation.employee.phoneNumber,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));

      const matchesFilter =
        filter === "all" ||
        (filter === "unread" && isUnread(conversation)) ||
        (filter === "escalated" && Boolean(conversation.activeEscalation));

      return matchesQuery && matchesFilter;
    });
  }, [conversations, filter, query]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b border-border px-1 py-4">
        <h1 className="text-[20px] leading-7 font-semibold text-foreground">
          Conversations
        </h1>

        <label className="relative mt-4 block">
          <span className="sr-only">Search conversations</span>

          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-[15px] leading-5 outline-none transition-colors placeholder:text-muted-foreground focus:border-info focus:ring-2 focus:ring-info/20"
          />
        </label>

        <div
          className="mt-3 flex gap-1"
          role="group"
          aria-label="Conversation filters"
        >
          {filters.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "rounded-md px-2.5 py-1 text-[14px] leading-5 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-info",
                filter === value
                  ? "bg-brand-hr text-chat-filter-active-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-color:#c4c4c4_transparent] scrollbar-thin [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c4c4c4] [&::-webkit-scrollbar-thumb:hover]:bg-[#a8a8a8]">
        {conversations === null && !error ? <ConversationListSkeleton /> : null}

        {error ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <p className="text-[15px] leading-5 font-semibold">
              Couldn’t load conversations
            </p>

            <p className="mt-1 text-[14px] leading-5 text-muted-foreground">
              Please try again in a moment.
            </p>

            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[14px] leading-5 font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-info"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : null}

        {conversations?.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <MessageSquare
              className="size-7 text-muted-foreground"
              aria-hidden="true"
            />

            <p className="mt-3 text-[15px] leading-5 font-semibold">
              No conversations yet
            </p>

            <p className="mt-1 text-[14px] leading-5 text-muted-foreground">
              Employee conversations will appear here when they start.
            </p>
          </div>
        ) : null}

        {conversations &&
        conversations.length > 0 &&
        visibleConversations.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[14px] leading-5 text-muted-foreground">
            No conversations match your search or filter.
          </div>
        ) : null}

        {visibleConversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            conversation={conversation}
          />
        ))}
      </div>
    </div>
  );
}
