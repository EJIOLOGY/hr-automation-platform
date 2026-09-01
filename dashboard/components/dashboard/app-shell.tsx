"use client";

import { useEffect, useState } from "react";
import { AccountMenu } from "./account-menu";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavigationRail } from "./navigation-rail";
import { SecondaryWorkspace } from "./secondary-workspace";
import { ConversationList } from "./conversation-list";
import { ConversationProvider } from "./conversation-context";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  useEffect(() => {
    setIsAccountMenuOpen(false);
  }, [pathname]);

  const isAnalytics = pathname === "/dashboard/analytics";
  const isConversations = pathname === "/dashboard/conversations";

  const content = (
    <>
      <NavigationRail
        isAccountMenuOpen={isAccountMenuOpen}
        onAccountMenuToggle={() => setIsAccountMenuOpen((current) => !current)}
      />

      {!isAnalytics && (
        <aside className="min-h-0 overflow-hidden border border-dashed bg-card p-4 max-[760px]:hidden">
          {isAccountMenuOpen ? (
            <div id="account-menu" className="h-full">
              <AccountMenu onClose={() => setIsAccountMenuOpen(false)} />
            </div>
          ) : isConversations ? (
            <ConversationList />
          ) : (
            <SecondaryWorkspace
              title="Workspace"
              description="Select a section to view its operational list."
            />
          )}
        </aside>
      )}

      <section
        className="min-h-0 min-w-0 overflow-y-auto bg-card"
        aria-label="Active workspace"
      >
        {children}
      </section>
    </>
  );

  return (
    <main
      className={
        isAnalytics
          ? "grid h-dvh grid-cols-[8.7rem_minmax(0,1fr)] overflow-hidden bg-background max-[760px]:grid-cols-[4.5rem_minmax(0,1fr)]"
          : "grid h-dvh grid-cols-[8.7rem_minmax(17rem,22rem)_minmax(0,1fr)] overflow-hidden bg-background max-[760px]:grid-cols-[4.5rem_minmax(0,1fr)]"
      }
    >
      {isConversations ? (
        <ConversationProvider>{content}</ConversationProvider>
      ) : (
        content
      )}
    </main>
  );
}
