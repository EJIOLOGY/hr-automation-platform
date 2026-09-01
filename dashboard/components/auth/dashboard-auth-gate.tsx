"use client";

import type { ReactNode } from "react";

import { useAuth } from "./auth-provider";
import { LoginModal } from "./login-modal";

interface DashboardAuthGateProps {
  children: ReactNode;
}

export function DashboardAuthGate({ children }: DashboardAuthGateProps) {
  const { isLoading, isAuthenticated } = useAuth();

  // Wait for the refresh-session check to finish.
  // This prevents the login modal from flashing
  // while an existing session is being restored.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc]">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <>
      {children}

      {!isAuthenticated && <LoginModal />}
    </>
  );
}
