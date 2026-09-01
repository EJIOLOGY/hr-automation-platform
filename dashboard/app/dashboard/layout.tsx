import { AuthProvider } from "@/components/auth/auth-provider";
import { DashboardAuthGate } from "@/components/auth/dashboard-auth-gate";
import { AppShell } from "@/components/dashboard/app-shell";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <AuthProvider>
      <DashboardAuthGate>
        <AppShell>{children}</AppShell>
      </DashboardAuthGate>
    </AuthProvider>
  );
}
