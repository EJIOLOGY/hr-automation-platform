"use client";

import React from "react";
import { LogOut, UserRound, ChevronLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";

interface AccountMenuProps {
  onClose: () => void;
}

export function AccountMenu({ onClose }: AccountMenuProps) {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await logout();
    } finally {
      setIsLoggingOut(false);
      onClose();
    }
  }

  const fullName = user?.fullName ?? "HR Officer";
  const role =
    user?.role === "ADMIN"
      ? "Administrator"
      : user?.role === "OFFICER"
        ? "HR Officer"
        : (user?.role ?? "HR Officer");

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to conversations"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>

        <h2 className="text-base font-semibold text-foreground">Account</h2>
      </header>

      {/* Account identity */}
      <div className="shrink-0 border-b px-4 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-blue text-base font-semibold text-white">
            {getInitials(fullName)}
          </span>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {fullName}
            </p>

            <p className="truncate text-xs text-muted-foreground">{role}</p>

            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-success" />
              Online
            </div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 px-2 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
        >
          <UserRound
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />

          <span>Profile</span>
        </button>

        <button
          type="button"
          disabled={isLoggingOut}
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-5" aria-hidden="true" />
          )}

          <span>{isLoggingOut ? "Logging out..." : "Log out"}</span>
        </button>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "HR";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[parts.length - 1][0]}${parts[0][0]}`.toUpperCase();
}
