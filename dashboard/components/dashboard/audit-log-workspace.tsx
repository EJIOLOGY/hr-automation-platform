"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ScrollText } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { getAuditLogs, type AuditLogRecord } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

export function AuditLogWorkspace() {
  const { accessToken } = useAuth();
  const [records, setRecords] = useState<AuditLogRecord[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAuditLogs = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAuditLogs(accessToken);
      setRecords(data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load audit logs. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    if (!accessToken) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    getAuditLogs(accessToken)
      .then((data) => {
        if (active) {
          setRecords(data.items);
          setNextCursor(data.nextCursor);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load audit logs. Please try again.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  const handleRefresh = async () => {
    if (!accessToken || isRefreshing) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await getAuditLogs(accessToken);
      setRecords(data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to refresh audit logs. Please try again.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLoadMore = async () => {
    if (!accessToken || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await getAuditLogs(accessToken, nextCursor);
      setRecords((prev) => (prev ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load older audit logs.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="mb-2">
          <Link
            href="/dashboard/hr-requests"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back to HR Requests
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Audit Log</h1>
            <p className="mt-0.5 text-[14px] leading-5 text-muted-foreground">
              Recorded HR officer and system actions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={cn("size-3.5", isRefreshing && "animate-spin")}
              />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl space-y-4">
          {error ? (
            <div
              role="alert"
              className="flex items-center justify-between rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={loadAuditLogs}
                className="font-medium underline hover:opacity-80"
              >
                Retry
              </button>
            </div>
          ) : null}

          {isLoading && records === null ? (
            <AuditTableSkeleton />
          ) : records && records.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ScrollText className="size-6" />
              </span>
              <p className="mt-4 text-[16px] font-semibold">No audit logs recorded</p>
              <p className="mt-1 text-[14px] text-muted-foreground">
                Administrative and system activities will appear here once recorded.
              </p>
            </div>
          ) : records ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-[12px] font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Entity</th>
                      <th className="px-4 py-3">Entity ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((record) => (
                      <tr
                        key={record.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted-foreground">
                          {formatDate(record.createdAt, true)}
                        </td>
                        <td className="px-4 py-3">
                          {record.actor ? (
                            <div>
                              <p className="text-[14px] font-medium text-foreground">
                                {record.actor.fullName}
                              </p>
                              <p className="text-[12px] text-muted-foreground">
                                {record.actor.email}
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground">
                              {record.actorType}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[12px] font-medium text-foreground">
                            {record.action}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[13px] font-medium text-foreground">
                          {record.entityType}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-muted-foreground">
                          {record.entityId ? (
                            <span
                              className="inline-block max-w-xs truncate"
                              title={record.entityId}
                            >
                              {record.entityId}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextCursor ? (
                <div className="border-t border-border p-3 text-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    {isLoadingMore ? "Loading more…" : "Load older records"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AuditTableSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="h-4 w-48 rounded bg-muted animate-pulse" />
      <div className="space-y-3 pt-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-4 items-center">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
            <div className="h-4 w-36 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
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
