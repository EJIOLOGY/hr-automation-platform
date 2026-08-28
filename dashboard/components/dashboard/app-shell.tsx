import type { ReactNode } from "react";
import { NavigationRail } from "./navigation-rail";

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
        <div className="flex h-full flex-col rounded-xl bg-muted/30 p-5">
          <p className="text-sm font-medium">Workspace</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Select a section to view its operational list.
          </p>
        </div>
      </aside>
      <section className="min-w-0 bg-card" aria-label="Active workspace">
        {children}
      </section>
    </main>
  );
}
