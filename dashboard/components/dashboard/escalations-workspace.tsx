"use client";

import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, UserCheck } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  claimEscalation,
  closeEscalation,
  getEscalation,
  getEscalations,
  resolveEscalation,
  type EscalationRecord,
  type EscalationStatus,
} from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";
import { useOperationalQueue } from "./operational-queue-context";

const filters: Array<{ label: string; value?: EscalationStatus }> = [
  { label: "All" },
  { label: "Open", value: "OPEN" },
  { label: "In progress", value: "IN_PROGRESS" },
];

export function EscalationQueue() {
  const { accessToken } = useAuth();
  const { selectedId, selectId, refreshKey } = useOperationalQueue();
  const [status, setStatus] = useState<EscalationStatus | undefined>();
  const [items, setItems] = useState<EscalationRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(null);
    setFailed(false);
    getEscalations(accessToken, status)
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshKey, status]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b border-border px-2 py-4">
        <h1 className="text-[20px] font-semibold leading-7">Escalations</h1>
        <p className="mt-0.5 text-[14px] leading-5 text-muted-foreground">
          Employee issues requiring HR attention.
        </p>
        <div
          className="mt-3 flex gap-1"
          role="group"
          aria-label="Escalation filters"
        >
          {filters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[14px] font-medium",
                status === filter.value
                  ? "bg-brand-hr text-chat-filter-active-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {items === null && !failed ? <QueueSkeleton /> : null}
        {failed ? <QueueError /> : null}
        {items?.length === 0 ? (
          <QueueEmpty
            title="No escalations"
            text="Escalated employee conversations will appear here."
          />
        ) : null}
        {items?.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectId(item.id)}
            className={cn(
              "w-full border-b border-border px-1 py-3 text-left transition-colors hover:bg-muted",
              selectedId === item.id && "bg-primary/8",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                {item.employee.fullName}
              </span>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-1 truncate text-[14px] leading-5 text-muted-foreground">
              {item.reason}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {formatDate(item.createdAt)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EscalationsWorkspace() {
  const { accessToken, user } = useAuth();
  const { selectedId, refresh } = useOperationalQueue();
  const [item, setItem] = useState<EscalationRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    if (!selectedId || !accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItem(null);
      setActionError("");
      return;
    }
    setItem(null);
    setFailed(false);
    setActionError("");
    getEscalation(selectedId, accessToken)
      .then((data) => {
        if (active) setItem(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [accessToken, selectedId]);

  if (!selectedId) {
    return (
      <EmptyWorkspace
        icon={<AlertTriangle className="size-5" />}
        title="Select an escalation"
        text="Choose an escalation from the queue to review its employee and status."
      />
    );
  }
  if (!item && !failed) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading escalation…
      </div>
    );
  }
  if (failed || !item) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Couldn’t load this escalation.
      </div>
    );
  }

  const isAssignedToUser = item.assignedHrOfficer?.id === user?.id;

  const runAction = async (action: "claim" | "resolve" | "close") => {
    if (!accessToken) {
      setActionError("Authentication token is missing. Please log in again.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const result =
        action === "claim"
          ? await claimEscalation(item.id, accessToken)
          : action === "resolve"
          ? await resolveEscalation(item.id, accessToken)
          : await closeEscalation(item.id, accessToken);
      setItem(result);
      refresh();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "This escalation could not be updated. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Escalation</p>
            <h1 className="mt-0.5 truncate text-[18px] font-semibold">
              {item.employee.fullName}
            </h1>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {item.employee.employeeNumber} · {item.employee.department}
            </p>
          </div>
          <StatusBadge status={item.status} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          <section>
            <p className="text-[13px] font-medium text-muted-foreground">Issue</p>
            <p className="mt-1 text-[15px] leading-6">{item.reason}</p>
          </section>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Detail label="Category" value={item.category ?? "General HR"} />
            <Detail label="Received" value={formatDate(item.createdAt, true)} />
            <Detail
              label="Assigned to"
              value={item.assignedHrOfficer?.fullName ?? "Unassigned"}
            />
            <Detail
              label="Conversation"
              value={item.session.isActive ? "Active" : "Inactive"}
            />
          </dl>
          {item.resolutionNote ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <p className="text-[13px] font-medium text-muted-foreground">
                Resolution note
              </p>
              <p className="mt-1 text-[14px] leading-6">{item.resolutionNote}</p>
            </section>
          ) : null}
          <div className="border-t border-border pt-5">
            {actionError ? (
              <p role="alert" className="mb-3 text-[13px] leading-5 text-danger">
                {actionError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {item.status === "OPEN" ? (
                <ActionButton
                  onClick={() => runAction("claim")}
                  disabled={busy}
                  icon={<UserCheck className="size-4" />}
                >
                  Claim escalation
                </ActionButton>
              ) : null}
              {item.status === "IN_PROGRESS" && isAssignedToUser ? (
                <ActionButton
                  onClick={() => runAction("resolve")}
                  disabled={busy}
                  icon={<Check className="size-4" />}
                >
                  Resolve
                </ActionButton>
              ) : null}
              {(item.status === "IN_PROGRESS" || item.status === "RESOLVED") &&
              isAssignedToUser ? (
                <button
                  type="button"
                  onClick={() => runAction("close")}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-2 text-[14px] font-medium hover:bg-muted disabled:opacity-50"
                >
                  Close escalation
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: EscalationStatus }) {
  const labels: Record<EscalationStatus, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In progress",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium",
        status === "OPEN"
          ? "bg-warning/10 text-warning"
          : status === "IN_PROGRESS"
          ? "bg-info/10 text-info"
          : "bg-muted text-muted-foreground",
      )}
    >
      {labels[status]}
    </span>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-3 py-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function QueueError() {
  return (
    <QueueEmpty
      title="Couldn’t load escalations"
      text="Please refresh the page and try again."
    />
  );
}

function QueueEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1 text-[14px] leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function EmptyWorkspace({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[14px] font-medium">{value}</dd>
    </div>
  );
}

function ActionButton({
  children,
  icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-[14px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat(
    undefined,
    includeTime
      ? {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  ).format(new Date(value));
}
