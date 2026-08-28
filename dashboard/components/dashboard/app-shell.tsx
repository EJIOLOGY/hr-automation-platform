import type { ReactNode } from "react";
import { NavigationRail } from "./navigation-rail";
import { SecondaryWorkspace } from "./secondary-workspace";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <main className="grid min-h-dvh grid-cols-[10.5rem_minmax(17rem,22rem)_minmax(0,1fr)] overflow-hidden bg-background max-[760px]:grid-cols-[4.5rem_minmax(0,1fr)]">
      <NavigationRail />
      <aside
        className="border border-dashed bg-card p-4 max-[760px]:hidden"
        aria-label="Workspace list"
      >
        <SecondaryWorkspace
          title="Workspace"
          description="Select a section to view its operational list."
        />
      </aside>
      <section className="min-w-0 bg-card" aria-label="Active workspace">
        {children}
      </section>
    </main>
  );
}
