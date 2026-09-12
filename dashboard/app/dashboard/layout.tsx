import { AuthProvider } from "@/components/auth/auth-provider";
import { DashboardAuthGate } from "@/components/auth/dashboard-auth-gate";
import { AppShell } from "@/components/dashboard/app-shell";
import { RealtimeProvider } from "@/components/dashboard/realtime-provider";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <DashboardAuthGate>
          <AppShell>{children}</AppShell>
        </DashboardAuthGate>
      </RealtimeProvider>
    </AuthProvider>
  );
}
