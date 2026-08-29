"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavigationRail } from "./navigation-rail";
import { SecondaryWorkspace } from "./secondary-workspace";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isAnalytics = pathname === "/dashboard/analytics";

  return (
    <main
      className={
        isAnalytics
          ? "grid min-h-dvh grid-cols-[8.7rem_minmax(0,1fr)] overflow-hidden bg-background max-[760px]:grid-cols-[4.5rem_minmax(0,1fr)]"
          : "grid min-h-dvh grid-cols-[8.7rem_minmax(17rem,22rem)_minmax(0,1fr)] overflow-hidden bg-background max-[760px]:grid-cols-[4.5rem_minmax(0,1fr)]"
      }
    >
      <NavigationRail />

      {!isAnalytics && (
        <aside
          className="border border-dashed bg-card p-4 max-[760px]:hidden"
          aria-label="Workspace list"
        >
          <SecondaryWorkspace
            title="Workspace"
            description="Select a section to view its operational list."
          />
        </aside>
      )}

      <section className="min-w-0 bg-card" aria-label="Active workspace">
        {children}
      </section>
    </main>
  );
}
