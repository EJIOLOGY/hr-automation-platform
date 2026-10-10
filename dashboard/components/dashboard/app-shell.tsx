"use client";

import { useState } from "react";
import { AccountMenu } from "./account-menu";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavigationRail } from "./navigation-rail";
import { SecondaryWorkspace } from "./secondary-workspace";
import { ConversationList } from "./conversation-list";
import { ConversationProvider } from "./conversation-context";
import { OperationalQueueProvider } from "./operational-queue-context";
import { EscalationQueue } from "./escalations-workspace";
import { HrRequestsQueue } from "./hr-requests-workspace";
import { DashboardPlaceholder } from "./dashboard-placeholder";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [accountMenuPath, setAccountMenuPath] = useState<string | null>(null);

  const isAnalytics = pathname === "/dashboard/analytics";
  const isAuditLogs = pathname === "/dashboard/hr-requests/audit-logs";
  const isFullWorkspace = isAnalytics || isAuditLogs;
  const isConversations = pathname === "/dashboard/conversations";
  const isEscalations = pathname === "/dashboard/escalations";
  const isHrRequests =
    pathname === "/dashboard/hr-requests" ||
    pathname.startsWith("/dashboard/hr-requests/");
  const showAccountMenu = accountMenuPath === pathname;
  // Opening the account menu always gives it the secondary section, even on
  // pages (Analytics, Audit Logs) that normally have only two sections.
  const showSecondary = !isFullWorkspace || showAccountMenu;

  const content = (
    <>
      <NavigationRail
        isAccountMenuOpen={showAccountMenu}
        onNavigate={() => setAccountMenuPath(null)}
        onAccountMenuToggle={() =>
          setAccountMenuPath((current) =>
            current === pathname ? null : pathname,
          )
        }
      />

      {showSecondary && (
        <aside
          className={
            showAccountMenu
              ? "min-h-0 overflow-hidden border border-dashed bg-card px-1.5 pr-0"
              : "min-h-0 overflow-hidden border border-dashed bg-card px-1.5 pr-0 max-[760px]:hidden"
          }
        >
          {showAccountMenu ? (
            <div id="account-menu" className="h-full">
              <AccountMenu onClose={() => setAccountMenuPath(null)} />
            </div>
          ) : isConversations ? (
            <ConversationList />
          ) : isEscalations ? (
            <EscalationQueue />
          ) : isHrRequests ? (
            <HrRequestsQueue />
          ) : (
            <SecondaryWorkspace
              title="Workspace"
              description="Select a section to view its operational list."
            />
          )}
        </aside>
      )}

      <section
        className="min-h-0 min-w-0 overflow-y-auto bg-card max-[760px]:data-[account=open]:hidden"
        data-account={showAccountMenu ? "open" : "closed"}
        aria-label={showAccountMenu ? "Account workspace" : "Active workspace"}
      >
        {/* Account's own tertiary page: reserved, intentionally unused for now. */}
        {showAccountMenu && <DashboardPlaceholder title="Account" />}
        {/* Keep the page mounted (hidden) so its state survives opening Account. */}
        <div className={showAccountMenu ? "hidden" : "contents"}>
          {children}
        </div>
      </section>
    </>
  );

  return (
    <main
      className={
        !showSecondary
          ? "grid h-dvh grid-cols-[8.7rem_minmax(0,1fr)] overflow-hidden bg-background max-[760px]:grid-cols-[4.5rem_minmax(0,1fr)]"
          : "grid h-dvh grid-cols-[8.7rem_minmax(17rem,22rem)_minmax(0,1fr)] overflow-hidden bg-background max-[760px]:grid-cols-[4.5rem_minmax(0,1fr)]"
      }
    >
      {isConversations ? (
        <ConversationProvider>{content}</ConversationProvider>
      ) : isEscalations || isHrRequests ? (
        <OperationalQueueProvider>{content}</OperationalQueueProvider>
      ) : (
        content
      )}
    </main>
  );
}
